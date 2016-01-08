(function () {
    var modules = {};

    /**
     *
     * @param value
     * @returns {boolean}
     */
    function isArray( value ) {
        return Fancy.getType( value ) === "array";
    }

    /**
     *
     * @param value
     * @returns {boolean}
     */
    function isFunction( value ) {
        return Fancy.getType( value ) === "function";
    }

    /**
     *
     * @param value
     * @returns {boolean}
     */
    function isObject( value ) {
        return Fancy.getType( value ) === "object";
    }

    /**
     *
     * @param object
     * @param callback
     */
    function forEach( object, callback ) {
        for ( var i in object ) {
            if ( object.hasOwnProperty( i ) ) {
                callback( object[ i ], (i.match( /^\d*$/ ) ? parseInt( i ) : i) );
            }
        }
    }

    /**
     *
     * @param {String} str
     * @returns {string|XML|void}
     */
    function escapeRegExp( str ) {
        return str.replace( /[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&" );
    }


    /**
     *
     * @param {String} type
     * @param {String} msg
     * @param {...*} args
     */
    function minError( type, msg, args ) {
        var list = Array.prototype.slice.call( arguments );
        list.shift();
        list.shift();
        list.forEach( function ( it, i ) {
            msg = msg.replace( "{" + i + "}", it );
        } );
        return new Error( "[" + type + "]: " + msg );
    }

    /**
     *
     * @param instance
     * @returns {{getProvider: getProvider, get: get, provider: provider, factory: factory, invoke: invoke, annotate: annotate}}
     */
    function createInjector( instance ) {
        var providerSuffix = "Provider",
            providerCache  = {},
            instanceCache  = {};

        /**
         *
         * @param name
         * @returns {Object|*|factory|Function}
         */
        function getProvider( name ) {
            var factory = providerCache[ name ];
            if ( factory ) {
                return factory.factory;
            }
        }

        /**
         *
         * @param name
         * @returns {*}
         */
        function getInstance( name ) {
            var factory = providerCache[ name + providerSuffix ];
            if ( !factory ) {
                throw minError( 'pget', "Did not find '{0}'.", name );
            }
            if ( factory.type === "service" ) {
                return invoke( factory.factory.$get );
            }
            if ( instanceCache[ name ] ) {
                return instanceCache[ name ];
            } else {
                return instanceCache[ name ] = invoke( factory.factory.$get );
            }
        }

        /**
         *
         * @param name
         * @returns {*}
         */
        function get( name ) {
            if ( name.match( new RegExp( providerSuffix + "$" ) ) ) {
                return getProvider( name );
            } else {
                return getInstance( name );
            }
        }

        /**
         *
         * @param fn
         * @returns {*}
         */
        function annotate( fn ) {
            var FN_ARGS        = /^[^\(]*\(\s*([^\)]*)\)/m;
            var FN_ARG_SPLIT   = /,/;
            var FN_ARG         = /^\s*(_?)(\S+?)\1\s*$/;
            var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
            var $inject,
                fnText,
                argDecl,
                last;
            if ( isFunction( fn ) ) {
                if ( !($inject = fn.$inject) ) {
                    $inject = [];
                    if ( fn.length ) {
                        fnText  = fn.toString().replace( STRIP_COMMENTS, '' );
                        argDecl = fnText.match( FN_ARGS );
                        forEach( argDecl[ 1 ].split( FN_ARG_SPLIT ), function ( arg ) {
                            arg.replace( FN_ARG, function ( all, underscore, name ) {
                                $inject.push( name );
                            } );
                        } );
                    }
                    fn.$inject = $inject;
                }
            }
            else if ( isArray( fn ) ) {
                last    = fn.length - 1;
                $inject = fn.slice( 0, last );
            }
            return $inject;
        }

        /**
         *
         * @param instance
         * @returns {*}
         */
        function extractInject( instance ) {
            if ( isFunction( instance ) ) {
                instance.$inject = instance.$inject || [];
                return instance;
            } else if ( isArray( instance ) ) {
                var inject = Array.prototype.slice.call( instance ),
                    fn     = inject.pop();

                fn.$inject = inject;
                return fn;
            }
        }

        /**
         *
         * @param fn
         * @param self
         * @returns {*}
         */
        function invoke( fn, self ) {
            fn          = extractInject( fn );
            var args    = [],
                $inject = annotate( fn ),
                length, i,
                key;
            for ( i = 0, length = $inject.length; i < length; i++ ) {
                key = $inject[ i ];
                if ( typeof key !== 'string' ) {
                    throw minError( 'itkn', 'Incorrect injection token! Expected service name as string, got {0}', key );
                }
                args.push( get( key ) );
            }
            return fn.apply( self, args );
        }

        /**
         *
         * @param Type
         * @returns {Object}
         */
        function instantiate( Type ) {
            var instance      = Object.create( (isArray( Type ) ? Type[ Type.length - 1 ] : Type).prototype || null );
            var returnedValue = invoke( Type, instance );

            return isObject( returnedValue ) || isFunction( returnedValue ) ? returnedValue : instance;
        }

        /**
         *
         * @param name
         * @param factory
         * @param type
         * @returns {*}
         */
        function setProvider( name, factory, type ) {
            if ( isFunction( factory ) || isArray( factory ) ) {
                factory = instantiate( factory );
            }
            if ( !factory.$get ) {
                throw minError( 'pget', "Provider '{0}' must define $get factory method.", name );
            }
            var provided = providerCache[ name + providerSuffix ];
            if ( provided ) {
                throw minError( "provider", "A {0} with name '{1}' is already defined", Fancy.capitalize( provided.type ), name );
            }
            providerCache[ name + providerSuffix ] = {
                name   : name,
                type   : type,
                factory: factory
            };
            return providerCache[ name + providerSuffix ];
        }


        /**
         *
         * @param name
         * @param factory
         * @returns {*}
         */
        function provider( name, factory ) {
            setProvider( name, factory, "provider" );
            return instance;
        }

        /**
         *
         * @param name
         * @param factory
         * @returns {*}
         */
        function factory( name, factory ) {
            setProvider( name, function () {
                this.$get = factory;
            }, "factory" );
            return instance;
        }

        function service( name, factory ) {
            setProvider( name, function () {
                this.$get = factory;
            }, "service" );
        }

        return {
            getProvider: getProvider,
            get        : get,
            provider   : provider,
            factory    : factory,
            invoke     : invoke,
            annotate   : annotate,
            service    : service
        }
    }

    /**
     *
     * @param name
     * @param el
     * @param scope
     * @returns {*}
     * @constructor
     */
    function Module( name, el, scope ) {

        /**
         *
         * @param provider
         * @param method
         * @param insertMethod
         * @param queue
         * @returns {Function}
         */
        function invokeLater( provider, method, insertMethod, queue ) {
            if ( !queue ) {
                queue = invokeQueue;
            }
            return function () {
                queue[ insertMethod || 'push' ]( [ provider, method, arguments ] );
                return module;
            };
        }

        var module = modules[ name ];
        if ( !module ) {
            module = modules[ name ] = {};
            var invokeQueue  = [],
                runBlocks    = [],
                configBlocks = [],
                $provider    = createInjector( module );
            module.directive = invokeLater( "$compileProvider", "directive" );
            module.filter    = invokeLater( "$filterProvider", "register" );
            module.factory   = invokeLater( "$provide", "factory" );
            module.service   = invokeLater( "$provide", "service" );
            module.provider  = invokeLater( "$provide", "provider" );
            module.config    = invokeLater( '$injector', 'invoke', 'push', configBlocks );
            module.bootstrap = function () {
                runInvokeQueue( invokeQueue );
                runInvokeQueue( configBlocks );
                runInvokeQueue( runBlocks );
                $provider.get( "$compile" )( el )( scope );
                return module;
            };
            $provider.provider( "$provide", function () {
                this.$get = function () {
                    return $provider;
                }
            } );
            $provider.provider( "$injector", function () {
                this.$get = function () {
                    return { get: $provider.get, invoke: $provider.invoke };
                }
            } );
            $provider.provider( "$parse", $parseProvider );
            $provider.provider( "$filter", $filterProvider );
            $provider.provider( "$compile", $compileProvider );

            module.filter( "date", function () {
                return function ( value ) {

                    if ( Fancy.getType( value ) !== "date" ) {
                        return undefined;
                    }

                    return value.toLocaleString();
                };
            } );

            function runInvokeQueue( queue ) {
                var i, ii;
                for ( i = 0, ii = queue.length; i < ii; i++ ) {
                    var invokeArgs = queue[ i ],
                        provider   = $provider.get( invokeArgs[ 0 ] );
                    provider[ invokeArgs[ 1 ] ].apply( provider, invokeArgs[ 2 ] );
                }
            }
        }
        return module;
    }

    function ASTCompiler( expression ) {
        var SCOPE_NAME = "s",
            EXTRA_NAME = "l",
            varCount   = 0,
            lexer      = Fancy.lexer( expression );

        var index  = 0,
            scope  = [],
            opened = 0,
            item   = lexer[ index ];

        this.variablePath = [];
        this.variables    = [];
        this.declarations = [];
        this.body         = [];

        this.compilePart = function ( item, index ) {
            var isFunctionOpening = this.isFunctionOpening( item, index );
            if ( isFunctionOpening ) {
                return isFunctionOpening;
            }
            if ( item.value === "(" || item.value === ")" ) {
                return
            }
            return {
                type      : item.key,
                length    : 1,
                index     : index,
                expression: item.value
            };

        };
        this.isKeyword   = function ( value ) {
            switch ( value ) {
                case "true":
                case "false":
                    return true;
            }
            return false;
        };
        this.if          = function ( scope, value, varName ) {
            return "if(SCOPE && \"PROPERTY\" in SCOPE) {VAR = SCOPE.PROPERTY}".replace( /SCOPE/gi, scope ).replace( /PROPERTY/gi, value ).replace( /VAR/gi, varName );
        };

        this.declare = function ( name, fn ) {
            var v = "v" + varCount++;

            this.variables.push( v );
            return "if( typeof " + name + " === \"function\") {" + v + " = " + fn + "}";
        };

        this.buildIdentifier = function ( item ) {
            if ( this.isKeyword( item.expression ) ) {
                return item.expression;
            }
            var v   = "v" + varCount++;
            var exp = item.expression,
                p   = this.variablePath.length ? this.variablePath[ this.variablePath.length - 1 ] : SCOPE_NAME;
            if ( item.type === "FUNCTION" ) {
                var name = exp.match( /^[^(]+/ ),
                    list = name[ 0 ].split( "." );
                var last;
                for ( var i in list ) {
                    if ( list.hasOwnProperty( i ) ) {
                        last = this.buildIdentifier( { type: "IDENTIFIER", expression: list[ i ] } );
                        //this.declarations.push( this.c.if( p, list[ i ], last ) );
                    }
                }
                exp = exp.replace( /^[^(]+/, last );
                v   = "v" + varCount;
                this.declarations.push( this.declare( last, exp ) );
            } else {
                this.declarations.push( this.if( p, exp, v ) );
            }
            this.variables.push( v );
            this.variablePath.push( v );
            return v;
        };
        this.resetPath       = function ( item ) {
            switch ( item.type ) {
                case "IDENTIFIER":
                case "DOT":
                    if ( this.isKeyword( item.expression ) ) {
                        this.variablePath = [];
                        return;
                    }
            }
            this.variablePath = [];
            return true;
        };

        this.isFunctionOpening = function ( item, index ) {
            var _index = index,
                name   = "",
                _item  = item;
            if ( !lexer[ index + 1 ] ) {
                return false;
            }
            function checkValue() {
                switch ( _item.key ) {
                    case "IDENTIFIER":
                    case "DOT":
                        return false;
                }
                return true;
            }

            function openClose() {
                if ( _item ) {
                    if ( _item.value === "(" && lexer[ _index + 1 ] && lexer[ _index + 1 ].value !== ")" ) {
                        open();
                    }
                    else if ( _item.value === ")" && lexer[ _index - 1 ] && lexer[ _index - 1 ].value !== "(" ) {
                        close();
                    }
                }
            }

            function open() {
                opened++;
            }

            function close() {
                opened--;
            }

            if ( checkValue() ) {
                return false;
            }
            while ( _item && _item.value !== "(" ) {
                if ( checkValue() ) {
                    return false;
                }
                name += _item.value;
                _index++;
                _item = lexer[ _index ];
            }
            if ( index !== _index ) {
                openClose();
                var declaration = {
                    type      : "FUNCTION",
                    index     : _index,
                    length    : _index - index,
                    arguments : [],
                    expression: name
                };
                if ( lexer[ _index + 1 ] && lexer[ _index + 1 ].value === ")" ) {
                    return declaration;
                }
                _index++;
                _item = lexer[ _index ];
                while ( _item && (opened > 1 ? true : _item.value !== ")") ) {
                    var part = this.compilePart( _item, _index );
                    if ( part ) {
                        declaration.arguments.push( part );
                        _index += part.length;
                    } else {
                        _index++;
                    }
                    openClose();
                    _item = lexer[ _index ];
                }
                declaration.length = _index - index;
                return declaration;
            }
            return false;
        };
        this.compile           = function () {
            console.log( expression );

            while ( index < lexer.length ) {
                var part = this.compilePart( item, index );
                if ( part ) {
                    scope.push( part );
                    index += part.length;
                } else {
                    index++;
                }
                item = lexer[ index ];
            }
            var self = this;

            function iterateArguments( item, index ) {
                var arg;
                switch ( item.type ) {
                    case "FUNCTION":
                        var fn = item.expression + "(";

                        forEach( item.arguments, function ( argument, i ) {
                            fn += iterateArguments( argument, i );
                        } );

                        fn += ")";
                        self.resetPath( item.type );
                        arg = self.buildIdentifier( {
                            type      : item.type,
                            expression: fn
                        } );
                        break;
                    case "IDENTIFIER":
                        self.resetPath( item );
                        arg = self.buildIdentifier( item );
                        break;
                    default:
                        arg = item.expression;
                }
                self.resetPath( item.type );
                return arg;
            }

            console.log( scope );
            forEach( scope, function ( item, index ) {
                self.body.push( iterateArguments( item, index ) );
            } );

            return this;
        };

        this.generate = function () {
            var fnString = "\nreturn function(" + SCOPE_NAME + "," + EXTRA_NAME + ") {\n";
            if ( this.variables.length ) {
                fnString += "var " + this.variables.join( ", " ) + ";\n";
            }
            if ( this.declarations.length ) {
                fnString += this.declarations.join( "\n" ) + "\n";
            }
            fnString += "return " + this.body.join( "" ) + ";\n}";
            return fnString;
        };

        return this;
    }

    (function () {
        var _ast = new ASTCompiler( "list.toString()[12].test()" );
        _ast.compile();
        console.log( _ast.generate() );
    })();

    (function () {
        var _ast = new ASTCompiler( "a(b(\"test\", 12, num.pad() + 3, pad.num() + 3)) - 12" );
        _ast.compile();
        console.log( _ast.generate() );
    })();

    function AST( lexer ) {
        var self             = this,
            filterMarker     = "PIPE",
            varCount         = 0,
            isFilterFunction = false,
            isParamHeader    = false,
            SCOPE_NAME       = "s",
            EXTRA_NAME       = "l";

        var parts = [];

        var filters  = (function () {
                var lastOpen = 0,
                    isFilter = false,
                    filters  = [];
                forEach( lexer, function ( item, i ) {
                    if ( item.key === "L_PARENTHESIS" ) {
                        lastOpen = i;
                        filters.push( { from: lastOpen } );
                    }
                    if ( item.key === "R_PARENTHESIS" ) {
                        if ( filters[ filters.length - 1 ] ) {
                            if ( isFilter ) {
                                filters[ filters.length - 1 ].to = i;
                            } else {
                                filters.splice( filters.length - 1, 1 );
                            }
                        }
                    }
                    if ( item.key === filterMarker ) {
                        isFilter = true;
                        if ( !filters[ filters.length - 1 ] ) {
                            filters.push( {} );
                        }
                        filters[ filters.length - 1 ].from = lastOpen;
                    }
                } );
                return filters;
            })(),

            sections = (function () {
                var lastOpen = 0,
                    sections = [];
                forEach( lexer, function ( item, i ) {
                    if ( item.key === "L_PARENTHESIS" ) {
                        lastOpen = i;
                        sections.push( { from: lastOpen } );
                    }
                    if ( item.key === "R_PARENTHESIS" ) {
                        if ( sections[ sections.length - 1 ] ) {
                            sections[ sections.length - 1 ].to = i;
                        }
                    }
                } );
                return sections;
            })();


        function varName( id, absolute ) {
            var name = "v";
            if ( absolute ) {
                return name + id;
            }
            varCount++;
            return name + ((varCount - 1) + (id || 0));
        }

        this.variables        = [];
        this.variablePath     = [];
        this.declarations     = [];
        this.body             = [];
        this.isFunctionStart  = function ( index ) {
            return this.isParameter( index ) && lexer[ index + 1 ] && lexer[ index + 1 ].key === "L_PARENTHESIS";
        };
        this.isFilterStart    = function ( index ) {
            if ( !lexer[ index ] ) {
                return false;
            }
            var isFilterStart    = this.isParameter( index ) && lexer[ index + 1 ] && lexer[ index + 1 ].key === filterMarker,
                isFilterFunction = ((lexer[ index ].key === "L_PARENTHESIS" || index === 0) ? isFilterFunction2( index ) : false),
                filterStarted    = lexer[ index - 1 ] ? lexer[ index - 1 ].key === "L_PARENTHESIS" : false;
            return filterStarted ? false : (isFilterStart || isFilterFunction);
        };
        this.allowPush        = function ( index ) {
            if ( this.variables.length && lexer[ index ].key === "DOT" ) {
                return false;
            }
            var n = lexer[ index + 1 ],
                p = lexer[ index - 1 ];
            return (n ? n.key !== "DOT" : true) && (p ? p.key !== "L_BRACKET" : true);
        };
        this.in               = function ( o, v ) {
            return '(' + o + ' && "' + v + '" in ' + o + ')';
        };
        this.isKeyword        = function ( value ) {
            switch ( value ) {
                case "true":
                case "false":
                    return true;
            }
            return false;
        };
        this.isParameter      = function ( i ) {
            var l = lexer[ i ];
            return l && l.key === "IDENTIFIER" && !this.isKeyword( l.value );
        };
        this.isFilter         = function ( i ) {
            var l = lexer[ i ],
                p = lexer[ i - 1 ],
                n = lexer[ i + 1 ];
            return (l ? l.key === filterMarker : false) && (p ? p.key !== filterMarker : false) && (n ? n.key !== filterMarker : true);
        };
        this.isAssign         = function ( i ) {
            var sep = "EQUALS";
            return (lexer[ i + 1 ] ? lexer[ i + 1 ].key === sep : false) && (lexer[ i + 2 ] ? lexer[ i + 2 ].key !== sep : false);
        };
        this.firstPart        = function ( i ) {
            return lexer[ i - 1 ] ? lexer[ i - 1 ].key !== "DOT" : true;
        };
        this.isFunction       = function ( index ) {
            return !isParamHeader && (lexer[ index + 1 ] ? lexer[ index + 1 ].key !== "L_PARENTHESIS" : true);
        };
        this.resetPath        = function ( index ) {
            var l = lexer[ index ];

            switch ( l.key ) {
                case "IDENTIFIER":
                case "DOT":
                    return false;
            }
            return true;
        };
        this.if               = function ( scope, v ) {
            return "if ( " + scope + " && \"" + v + "\" in " + scope + " )";
        };
        this.declare          = function () {
            var args = Array.prototype.slice.call( arguments );
            var k    = args.shift(),
                v    = args.join( "." );

            return [ "{", k, "=", v + ";", "}" ].join( " " );
        };
        this.wrapIdentifier   = function ( index ) {
            var l            = lexer[ index ], scope;
            var variablePath = [];

            function wrap( index ) {
                var l = lexer[ index ], scope;
                if ( self.isParameter( index ) ) {
                    var v = varName();
                    if ( variablePath.length ) {
                        scope = variablePath[ variablePath.length - 1 ];
                    } else {
                        scope = SCOPE_NAME;
                    }
                    self.declarations.push(
                        self.if( scope, l.value ) + self.declare( v, scope, l.value )
                    );
                    variablePath.push( v );
                    self.variables.push( v );
                    return v;
                }
                if ( self.resetPath( index ) ) {
                    variablePath = [];
                }
                return l && l.value;
            }

            if ( this.isParameter( index ) ) {
                var v = varName();
                if ( this.variablePath.length ) {
                    scope = this.variablePath[ this.variablePath.length - 1 ];
                } else {
                    scope = SCOPE_NAME;
                }
                if ( this.isFunction( index ) ) {
                    this.declarations.push(
                        this.if( scope, l.value ) + this.declare( v, scope, l.value )
                    );
                } else {
                    var args = [],
                        i    = index + 2,
                        n    = lexer[ i ];
                    while ( n && n.key !== "R_PARENTHESIS" ) {
                        switch ( n.key ) {
                            case "DOT":
                            case "COMMA":
                                break;
                            default:
                                args.push( wrap( i ) );
                                break;
                        }
                        i++;
                        n = lexer[ i ];
                    }
                    this.declarations.push(
                        this.if( scope, l.value ) + this.declare( v, scope, l.value + "( " + args.join( ", " ) + " )" )
                    );
                }
                if ( this.allowPush( index ) ) {
                    this.body.push( v );
                }
                this.variablePath.push( v );
                this.variables.push( v );
                return v;
            }
            if ( this.allowPush( index ) ) {
                this.body.push( l.value );
            }
            if ( this.resetPath( index ) ) {
                this.variablePath = [];
            }
            return l && l.value;
        };
        this.isFilterFunction = function ( index ) {
            var i = 0;
            while ( i < filters.length ) {
                var f = filters[ i ];
                if ( (f.to ? index < f.to : true) && index > f.from ) {
                    return true;
                }
                i++;
            }
            return false;
        };
        this.generate         = function () {
            var fnString = "\nreturn function(" + SCOPE_NAME + "," + EXTRA_NAME + ") {\n";
            if ( this.variables.length ) {
                fnString += "var " + this.variables.join( ", " ) + ";\n";
            }
            if ( this.declarations.length ) {
                fnString += this.declarations.join( "\n" ) + "\n";
            }
            fnString += "return " + this.body.join( "" ) + ";\n}";
            return fnString;
        };
        function isFilterFunction2( index ) {
            var i = 0;
            while ( i < filters.length ) {
                var f = filters[ i ];
                if ( (f.to ? index <= f.to : true) && index >= f.from ) {
                    return true;
                }
                i++;
            }
            return false;
        }

        function isInSection( index ) {
            var i = 0;
            while ( i < sections.length ) {
                var f = sections[ i ];
                if ( (f.to ? index <= f.to : true) && index >= f.from ) {
                    return true;
                }
                i++;
            }
            return false;
        }

        forEach( lexer, function ( it, i ) {
            var isFunctionStart = self.isFunctionStart( i ),
                isFilterStart   = self.isFilterStart( i ),
                isFilter        = isFilterFunction2( i ),
                isFunction      = isInSection( i );

            var msg = "filter.key: %o, ";
            msg += "filter.value: %o, ";
            msg += "isFunctionStart: %o, ";
            msg += "isFilterStart: %o, ";
            msg += "isFilter: %o, ";
            msg += "isFunction: %o, ";

            if ( isFilterStart ) {
                parts.push( { type: "filter", expression: it.value } );
            }
            else if ( isFunctionStart ) {
                parts.push( { type: "function", expression: it.value } );
            }
            else if ( isFilter || isFunction ) {
                parts[ parts.length - 1 ].expression += it.value;
            }
            else {
                parts.push( { type: "identifier", expression: it.value } );
            }
            console.log( msg, it.key, it.value, isFunctionStart, isFilterStart, isFilter, isFunction )
        } );
        console.log( parts );
        var string = "";
        forEach( parts, function ( item, index ) {
            var lex = Fancy.lexer( item.expression );
        } );
        console.log( string );
        forEach( lexer, function ( item, index ) {
            var isFilter       = self.isFilterFunction( index ),
                isAssign       = self.isAssign( index ),
                nextFilter     = self.isFilter( index + 1 ),
                previousFilter = self.isFilter( index - 1 );


            if ( item.key === "L_PARENTHESIS" ) {
                if ( self.isParameter( index - 1 ) ) {
                    isParamHeader = true;
                } else {
                    self.body.push( "( " );
                }
                return;
            }
            if ( item.key === "R_PARENTHESIS" ) {
                if ( !isParamHeader ) {
                    self.body.push( " )" );
                }
                isParamHeader = false;
                return;
            }
            if ( isParamHeader ) {
                return;
            }
            if ( isFilterFunction && !isFilter ) {
                self.body.push( " )" );
            }
            isFilterFunction = isFilter;
            if ( nextFilter ) {
                self.body.push( "$filter", "( " );
                return;
            }

            if ( isFilterFunction ) {
                if ( previousFilter ) {
                    self.body.push( '"' + item.value + '"', " )", "( " );
                    self.wrapIdentifier( index - 2 );
                    return;
                }
                switch ( item.key ) {
                    case "STRING":
                    case "NUMBER":
                    case "IDENTIFIER":
                        self.wrapIdentifier( index );
                        break;
                    case "COLON":
                        self.body.push( "," );
                        break;
                }
                return
            }
            self.wrapIdentifier( index );

        } );

        if ( isFilterFunction ) {
            this.body.push( ")" );
        }

    }

    /*******************************************************************************************************************
     *
     *      $parseProvider
     *
     ******************************************************************************************************************/
    $parseProvider.$inject = [];
    /**
     *
     * @returns {$parseProvider}
     */
    function $parseProvider() {
        var debug = false;

        this.debug = function ( state ) {
            debug = !!state;
        };

        this.$get = [ '$filter', function ( $filter ) {
            return function $parse( $expression ) {
                if ( debug ) {
                    console.groupCollapsed( $expression );
                }

                var lexer = new Fancy.lexer( $expression ),
                    ast   = new AST( lexer );


                var fn = (new Function( "$filter", "\"use strict\";" + ast.generate() + "" ));
                if ( debug ) {
                    console.log( fn );
                    console.groupEnd();
                }
                return fn( $filter );
            }
        } ];
        return this;
    }

    /*******************************************************************************************************************
     *
     *      $compileProvider
     *
     ******************************************************************************************************************/
    $compileProvider.$inject = [ "$parse", "$provide" ];
    /**
     *
     * @param $parse
     * @param $provide
     */
    function $compileProvider( $parse, $provide ) {
        var LEFT = "{{", RIGHT = "}}", Suffix = "Directive";

        function getAllElements( element, callback ) {
            var list = $( element );

            function iterate( el ) {
                if ( el.length ) {
                    var items = el.contents();
                    list      = list.add( items );
                    items.each( function () {
                        callback.call( this );
                    } );
                    items.each( function () {
                        iterate( $( this ), callback );
                    } );
                }
            }

            iterate( element );
        }

        function getExpression( l, r ) {
            var L = escapeRegExp( l ),
                R = escapeRegExp( r );
            return new RegExp( "(?:" + L + ")([^" + L + R + "]*)(?:" + R + ")", "g" );
        }

        function checkExpression( str ) {
            var expressions = getExpression( LEFT, RIGHT );
            if ( str.match( expressions ) ) {
                return str.replace( expressions, function ( match, $1 ) {
                    return $1;
                } );
            }

        }

        this.leftDelimiter = function ( value ) {
            LEFT = value;
        };

        this.directive = function ( name, factory ) {
            $provide.factory( name + Suffix, [ "$injector", function ( $injector ) {
                var directive = $injector.invoke( factory );
            } ] )
        };

        this.rightDelimiter = function ( value ) {
            RIGHT = value;
        };

        var parsed = [];

        function getTextNodesIn( node ) {
            var textNodes = [], nonWhitespaceMatcher = /\S/;

            function getTextNodes( node ) {
                if ( node.nodeType == 3 ) {
                    if ( nonWhitespaceMatcher.test( node.nodeValue ) ) {
                        textNodes.push( node );
                    }
                } else if ( node.childNodes ) {
                    for ( var i = 0, len = node.childNodes.length; i < len; ++i ) {
                        getTextNodes( node.childNodes[ i ] );
                    }
                }
            }


            getTextNodes( node );
            return textNodes;
        }

        this.$get = function () {
            return function ( $html ) {
                var list  = [];
                var nodes = getTextNodesIn( $( $html )[ 0 ] );

                return function ( $scope ) {
                    function checkContent( node, list ) {
                        var expression = checkExpression( node.nodeValue );
                        if ( expression ) {
                            list.push( [ node, node.nodeValue ] );
                        }
                    }

                    forEach( nodes, function ( node ) {
                        checkContent( node, parsed );
                    } );
                    getAllElements( $html, function () {
                        list.push( this );
                        if ( this.attributes ) {
                            Array.prototype.slice.call( this.attributes ).forEach( function ( attr ) {
                                checkContent( attr, parsed );
                            } );
                        }
                    } );
                    forEach( parsed, function ( it ) {
                        it[ 0 ].nodeValue = it[ 1 ].replace( getExpression( LEFT, RIGHT ), function ( match, $1 ) {
                            var evaluated = $parse( $1.trim() );
                            evaluated     = evaluated( $scope );
                            return Fancy.undefined( evaluated ) ? "" : evaluated;
                        } );
                    } );
                }
            }
        }
    }

    /*******************************************************************************************************************
     *
     *      $filterProvider
     *
     ******************************************************************************************************************/
    $filterProvider.$inject = [ "$provide" ];
    /**
     *
     * @param $provide
     */
    function $filterProvider( $provide ) {
        var suffix = "Filter";

        function register( name, factory ) {
            if ( isObject( name ) ) {
                var filters = {};
                forEach( name, function ( filter, key ) {
                    filters[ key ] = register( key, filter );
                } );
                return filters;
            } else {
                return $provide.factory( name + suffix, factory );
            }
        }

        this.register = register;
        this.$get     = [ '$injector', function ( $injector ) {
            return function ( name ) {
                return $injector.get( name + suffix );
            };
        } ];
    }

    Fancy.template     = "1.0.0";
    Fancy.api.template = function ( name, scope ) {
        return this.set( "FancyTemplate", function ( el ) {
            return new Module( name, el, scope );
        }, true );
    };

})();