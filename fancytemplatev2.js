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
            $provider.provider( "$debug", $debugProvider );
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
            varCount   = 0;

        var opened = 0;

        this.type = {
            "function"         : "FUNCTION",
            "bracketExpression": "BRACKETEXPRESSION",
            "identifier"       : "IDENTIFIER",
            "filter"           : "FILTER",
            "expression"       : "EXPRESSION",
            "functionCall"     : "FUNCTIONCALL"
        };

        this.functionCount = [];
        this.variablePath  = [];
        this.lastVariable  = "";
        this.variables     = [];
        this.declarations  = [];
        this.body          = [];


        this.if              = function ( scope, value, varName, call ) {
            return ("if(SCOPE && \"PROPERTY\" in SCOPE) {VAR = SCOPE.PROPERTY" + (call ? "()" : "") + "}").replace( /SCOPE/gi, scope ).replace( /PROPERTY/gi, value ).replace( /VAR/gi, varName );
        };
        this.notNull         = function ( varName ) {
            return "if( notNull( " + varName + " ) )";
        };
        this.isIn            = function ( currentVarName, call ) {
            return "if( isIn( " + currentVarName + ", \"" + call + "\" ) )";
        };
        this.buildIdentifier = function ( item ) {
            if ( this.isKeyword( item.expression ) ) {
                return item.expression;
            }
            var v   = this.createVar();
            var exp = item.expression,
                p   = this.variablePath.length ? this.variablePath[ this.variablePath.length - 1 ] : SCOPE_NAME;
            this.declarations.push( this.if( p, exp, v ) );
            this.variables.push( v );
            this.variablePath.push( v );
            return v;
        };


        this.currentScope = function () {
            if ( this.lastVariable ) {
                return this.lastVariable;
            } else {
                return SCOPE_NAME;
            }
        };
        this.createVar    = function ( add ) {
            var v = "v" + (varCount + (add || 0));
            if ( add === undefined ) {
                varCount++;
            }
            return v;
        };
        this.isKeyword    = function ( value ) {
            switch ( value ) {
                case "true":
                case "false":
                    return true;
            }
            return false;
        };
        this.resetPath    = function ( item ) {
            switch ( item.type ) {
                case "PLUS":
                case "MINUS":
                case "MULTIPLY":
                    this.lastVariable = "";
                    return true;
            }
            return false;
        };


        this.isFilterExpression   = function ( item, index, lexer ) {
            var _index = index,
                name   = "",
                opened = 0,
                _item  = item;
            if ( !lexer[ index + 1 ] ) {
                return false;
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

            function checkValue() {
                switch ( _item.key ) {
                    case "IDENTIFIER":
                    case "DOT":
                    case "NUMBER":
                    case "STRING":
                        return false;
                }
                return true;
            }

            if ( checkValue() ) {
                return false;
            }
            while ( _item && _item.value !== "|" ) {
                openClose();
                if ( checkValue() ) {
                    return false;
                }
                name += _item.value;
                _index++;
                _item = lexer[ _index ];
            }
            _index++;
            _item = lexer[ _index ];
            if ( _item && _item.value !== "|" ) {
                var declaration = {
                    type      : this.type.filter,
                    index     : _index,
                    length    : _index - index,
                    arguments : [],
                    expression: _item.value
                };
                _index++;
                _item = lexer[ _index ];
                declaration.arguments.push( compile( this, name )[ 0 ] );
                while ( _item && _item.value !== ")" ) {
                    if ( _item.value === ":" ) {
                        declaration.arguments.push( { type: "COMMA", expression: "," } );
                        _index++;
                    } else {
                        var part = this.compilePart( _item, _index, lexer );
                        if ( part ) {
                            declaration.arguments.push( part );
                            _index += part.length;
                        } else {
                            _index++;
                        }
                    }
                    _item = lexer[ _index ];
                }
                declaration.length = _index - index;
                return declaration;
            }
        };
        this.isBraceExpression    = function ( item, index, lexer ) {
            var _index = index,
                name   = "",
                open   = false,
                _item  = item;
            if ( !lexer[ index + 1 ] ) {
                return false;
            }
            function checkValue() {
                switch ( _item.key ) {
                    case "IDENTIFIER":
                    case "L_BRACKET":
                    case "NUMBER":
                    case "STRING":
                        return false;
                }
                return true;
            }

            if ( _item.value !== "[" ) {
                return
            }

            while ( _item && _item.value !== "]" ) {
                if ( checkValue() ) {
                    return false;
                }
                if ( _item.value === "[" ) {
                    open = true;
                }
                if ( open ) {
                    name += _item.value;
                }
                _index++;
                _item = lexer[ _index ];
            }

            if ( open ) {
                return {
                    type      : this.type.bracketExpression,
                    index     : _index + 1,
                    length    : (_index - index) + 1,
                    expression: name.substr( 1 )
                };
            }

        };
        this.isFunctionExpression = function ( item, index, lexer ) {
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
            if ( _index === lexer.length ) {
                return false;
            }
            if ( name[ 0 ] === "." ) {
                name = name.substr( 1 );
            }
            if ( index !== _index ) {
                openClose();
                var declaration = {
                    type      : this.type.function,
                    index     : _index,
                    length    : _index - index,
                    arguments : [],
                    expression: name
                };
                if ( lexer[ _index + 1 ] && lexer[ _index + 1 ].value === ")" ) {
                    declaration.index += 2;
                    declaration.length += 2;
                    return declaration;
                }
                _index++;
                _item = lexer[ _index ];
                while ( _item && (opened > 1 ? true : _item.value !== ")") ) {
                    var part = this.compilePart( _item, _index, lexer );
                    if ( part ) {
                        if ( part.expression !== "," ) {
                            declaration.arguments.push( part );
                        }
                        _index += part.length;
                    } else {
                        _index++;
                    }
                    openClose();
                    _item = lexer[ _index ];
                }
                declaration.arguments.pop();
                _index++;
                declaration.length = _index - index;
                return declaration;
            }
            return false;
        };
        this.isExpression         = function ( item, index, lexer ) {
            var _index = index, name = "", _item = item;
            if ( !lexer[ index + 1 ] ) {
                return false;
            }
            function checkValue() {
                switch ( _item.key ) {
                    case "IDENTIFIER":
                    case "DOT":
                        return true;
                }
                return false;
            }

            while ( _item && checkValue() ) {
                name += _item.value;
                _index++;
                _item = lexer[ _index ];
            }
            if ( index !== _index ) {
                return {
                    type      : this.type.expression,
                    index     : _index,
                    length    : _index - index,
                    expression: name
                };
            }
        };


        function compile( self, exp ) {
            var scope = [],
                index = 0,
                lexer = Fancy.lexer( exp ),
                item  = lexer[ index ];
            while ( index < lexer.length ) {
                var part = self.compilePart( item, index, lexer );
                if ( part ) {
                    scope.push( part );
                    index += part.length;
                } else {
                    index++;
                }
                item = lexer[ index ];
            }
            return scope;
        }

        this.compilePart = function ( item, index, lexer ) {
            var isFunctionExpression = this.isFunctionExpression( item, index, lexer );
            if ( isFunctionExpression ) {
                return isFunctionExpression;
            }

            var isFilterExpression = this.isFilterExpression( item, index, lexer );
            if ( isFilterExpression ) {
                return isFilterExpression;
            }

            var isBraceExpression = this.isBraceExpression( item, index, lexer );
            if ( isBraceExpression ) {
                return isBraceExpression;
            }

            var isExpression = this.isExpression( item, index, lexer );
            if ( isExpression ) {
                return isExpression;
            }

            return {
                type      : item.key,
                length    : 1,
                index     : index,
                expression: item.value
            };

        };
        this.compile     = function () {
            var self = this, scope = compile( this, expression );

            function iterateArguments( item ) {
                var arg = "", newVar;
                console.log( item )
                switch ( item.type ) {
                    case self.type.function:
                        var currentVarName,
                            expressions = item.expression.split( "." ),
                            args        = [],
                            call        = expressions.pop();
                        if ( self.functionCount.length ) {
                            currentVarName = self.functionCount[ self.functionCount.length - 1 ];
                            self.body.pop();
                        } else {
                            currentVarName = self.currentScope();
                            self.functionCount.push( currentVarName );
                        }

                        forEach( item.arguments, function ( argument, i ) {
                            args.push( iterateArguments( argument, i ) );
                        } );

                        if ( expressions.length ) {
                            currentVarName = iterateArguments( {
                                type      : self.type.expression,
                                expression: expressions.join( "." )
                            } );
                        }
                        newVar = self.createVar();
                        self.functionCount.push( newVar );
                        self.declarations.push(
                            self.isIn( currentVarName, call ) + "{" + newVar + " = " + currentVarName + "." + call + "(" + args.join( "," ) + ")}"
                        );
                        //if ( !self.variablePath.length ) {
                        self.variables.push( newVar );
                        //}
                        arg = newVar;
                        if ( self.lastVariable ) {
                            self.body.pop();
                        }
                        self.lastVariable = arg;
                        break;
                    case self.type.identifier:
                        arg               = self.buildIdentifier( item );
                        self.lastVariable = arg;
                        break;
                    case self.type.bracketExpression:
                        newVar = self.createVar( -1 );
                        self.declarations.push( self.notNull( newVar ) + "{ " + newVar + " = " + newVar + "[" + item.expression + "] } else {" + newVar + " = undefined}" );
                        break;
                    case "DOT":
                        if ( self.variablePath.length == 1 ) {
                            return;
                        }
                        arg = ".";
                        break;
                    case self.type.filter:

                        arg = "$filter(\"" + item.expression + "\")(";
                        forEach( item.arguments, function ( argument, i ) {
                            arg += iterateArguments( argument, i );
                        } );

                        arg += ")";
                        break;
                    case self.type.expression:
                        forEach( item.expression.split( "." ), function ( item ) {
                            arg = self.buildIdentifier( { type: "IDENTIFIER", expression: item } );
                        } );
                        self.variablePath.push( arg );
                        self.lastVariable = arg;
                        break;
                    default:
                        arg = item.expression;
                }
                self.resetPath( item );
                return arg;
            }

            forEach( scope, function ( item ) {
                var it = iterateArguments( item );
                if ( it ) {
                    self.body.push( it );
                }
            } );

            return this;
        };
        this.generate    = function () {
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

        this.$get = [ "$filter", "$debug", function ( $filter, $debug ) {
            return function $parse( $expression ) {
                $debug.groupCollapsed( $expression );

                var ast = new ASTCompiler( $expression );
                ast.compile();

                var fn = (new Function( "$filter, notNull, getType, isIn", "\"use strict\";" + ast.generate() + "" ));
                $debug.log( fn );
                $debug.groupEnd();
                return fn( $filter, function ( item ) {
                    return !Fancy.undefined( item );
                }, Fancy.getType, function ( varName, prop ) {
                    if ( Fancy.undefined( varName ) ) {
                        return false;
                    }
                    if ( getType( varName ) === "object" || getType( varName ) === "array" ) {
                        return prop in varName;
                    }
                    return varName && varName[ prop ] !== undefined;
                } );
            }
        } ];
        return this;
    }

    function $debugProvider() {
        var debug = true;

        this.debug = function ( state ) {
            debug = !!state;
        };

        this.$get = function () {
            if ( debug ) {
                return console
            } else {
                var c = {};
                for ( var i in console ) {
                    c[ i ] = function () {};
                }
                return c
            }
        };

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