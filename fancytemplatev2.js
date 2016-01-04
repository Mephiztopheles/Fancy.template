(function () {
    var modules = {};

    function isArray( value ) {
        return Fancy.getType( value ) === "array";
    }

    function isFunction( value ) {
        return Fancy.getType( value ) === "function";
    }

    function isObject( value ) {
        return Fancy.getType( value ) === "object";
    }

    function forEach( object, callback ) {
        for ( var i in object ) {
            if ( object.hasOwnProperty( i ) ) {
                callback( object[ i ], i );
            }
        }
    }

    function escapeRegExp( str ) {
        return str.replace( /[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&" );
    }


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
     * @returns {{getProvider: getProvider, get: getInstance, provider: provider, factory: factory, invoke: invoke}}
     */
    function createInjector( instance ) {
        var cache         = {},
            instanceCache = {};

        function getInstance( name ) {
            var factory = cache[ name ];
            if ( name.match( /Provider$/ ) ) {
                return cache[ name.replace( /Provider$/, "" ) ].factory;
            }
            if ( factory ) {
                switch ( factory.type ) {
                    case "factory":
                    case "directive":
                    case "provider":
                        if ( instanceCache[ name ] ) {
                            return instanceCache[ name ];
                        } else {
                            return instanceCache[ name ] = invoke( factory.factory.$get );
                        }
                        break;
                    default:
                        return factory.factory.$get;

                }
            }
        }

        function getProvider( name ) {
            var factory = cache[ name ];
            if ( factory ) {
                return cache[ name ].factory;
            }
        }


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

        function invoke( fn, self, locals ) {
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
                args.push( locals && locals.hasOwnProperty( key ) ? locals[ key ] : getInstance( key ) );
            }
            return fn.apply( self, args );
        }

        function instantiate( Type, locals, serviceName ) {
            var instance      = Object.create( (isArray( Type ) ? Type[ Type.length - 1 ] : Type).prototype || null );
            var returnedValue = invoke( Type, instance, locals, serviceName );

            return isObject( returnedValue ) || isFunction( returnedValue ) ? returnedValue : instance;
        }

        function setProvider( name, factory, type ) {
            if ( isFunction( factory ) || isArray( factory ) ) {
                factory = instantiate( factory );
            }
            if ( !factory.$get ) {
                throw minError( 'pget', "Provider '{0}' must define $get factory method.", name );
            }
            var provided = cache[ name ];
            if ( provided ) {
                throw minError( "provider", "A {0} with name '{1}' is already defined", Fancy.capitalize( provided.type ), name );
            }
            cache[ name ] = {
                name   : name,
                type   : type,
                factory: factory
            };
            return cache[ name ];
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

        function factory( name, factory ) {
            setProvider( name, function () {
                this.$get = factory;
            }, "factory" );
            return instance;
        }

        return {
            getProvider: getProvider,
            get        : getInstance,
            provider   : provider,
            factory    : factory,
            invoke     : invoke,
            annotate   : annotate
        }
    }

    function Module( name, el, scope ) {
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

            module.filter( "date", function ( value ) {
                return value.toLocaleString();
            } );

            function runInvokeQueue( queue ) {
                var i, ii;
                for ( i = 0, ii = queue.length; i < ii; i++ ) {
                    var invokeArgs = queue[ i ],
                        provider   = $provider.get( invokeArgs[ 0 ] );
                    provider[ invokeArgs[ 1 ] ].apply( provider, invokeArgs[ 2 ] );
                }
            }

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
        }
        return module;
    }


    $filterProvider.$inject = [ '$provide' ];
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

    $compileProvider.$inject = [ "$parse", "$provide" ];
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
                        var expressions = getExpression( LEFT, RIGHT ),
                            parsed      = it[ 1 ].replace( expressions, function ( match, $1 ) {
                                var evaluated = $parse( $1.trim() );
                                evaluated = evaluated( $scope );
                                return Fancy.undefined( evaluated ) ? "" : evaluated;
                            } );

                        it[ 0 ].nodeValue = parsed;
                    } );
                }
            }
        }
    }

    function $parseProvider() {


        function isKeyword( value ) {
            switch ( value ) {
                case "true":
                case "false":
                    return true;
            }
            return false;
        }

        function replaceAt( string, index, regex, character ) {
            return string.substr( 0, index ) + string.substr( index ).replace( regex, character );
        }

        function _in( o, v ) {
            return '(' + o + ' && "' + v + '" in ' + o + ')';
        }

        var SCOPE_NAME = "s",
            EXTRA_NAME = "l";
        this.$get      = [ '$filter', function ( $filter ) {
            return function $parse( $expression ) {
                var lexer    = new Fancy.lexer( $expression ),
                    appendix = 0;

                var varCount         = 0,
                    fnString         = "return " + $expression.trim(),
                    isFilterFunction = false,
                    isParamHeader    = false;
                lexer.forEach( function ( it, i ) {
                    var isParameter = it.key === "IDENTIFIER" && !isKeyword( it.value ),
                        isFilter    = it.key === "PIPE",
                        isAssign    = (lexer[ i + 1 ] ? lexer[ i + 1 ].key === "EQUALS" : false) && (lexer[ i + 2 ] ? lexer[ i + 2 ].key !== "EQUALS" : false),
                        firstPart   = (lexer[ i - 1 ] ? lexer[ i - 1 ].key !== "DOT" : true),
                        replacement;
                    if ( isFilterFunction ) {
                        if ( it.key === "COLON" ) {
                            fnString = replaceAt( fnString, appendix, ":", "," );
                            appendix += 1;
                        } else if ( isParameter && firstPart && lexer[ i - 1 ].key !== "PIPE" ) {
                            updateFn( "var v" + varCount + ";if" + _in( EXTRA_NAME, it.value ) + "{v" + varCount + "=" + EXTRA_NAME + "." + it.value + ";}else{v" + varCount + "=" + SCOPE_NAME + "." + it.value + ";}" );
                        }
                        if ( !lexer[ i + 1 ] ) {
                            fnString += ")";
                        }
                    }
                    else if ( isFilter ) {
                        isFilterFunction = true;
                        var value;
                        if ( lexer[ i - 1 ].key === "IDENTIFIER" ) {
                            value = "v" + (varCount - 1);
                        } else {
                            value = lexer[ i - 1 ].value;
                        }
                        replacement = "$filter('" + lexer[ i + 1 ].value + "')(" + value;
                        fnString    = replaceAt( fnString, appendix, value, replacement );
                        fnString    = replaceAt( fnString, appendix, new RegExp( " *\\| *" + lexer[ i + 1 ].value ), "" );
                        appendix += replacement.length;
                    } else if ( isParameter && isAssign ) {
                        replacement = "" + SCOPE_NAME + "." + it.value;
                        fnString    = replaceAt( fnString, appendix, it.value, replacement );
                        appendix += replacement.length;
                    } else if ( isParamHeader && isParameter && firstPart ) {
                        updateFn( "var v" + varCount + ";if" + _in( EXTRA_NAME, it.value ) + "{v" + varCount + "=" + EXTRA_NAME + "." + it.value + ";}else{v" + varCount + "=" + SCOPE_NAME + "." + it.value + ";}" );
                    } else if ( isParameter && firstPart ) {
                        updateFn( "var v" + varCount + ";if" + _in( SCOPE_NAME, it.value ) + "{v" + varCount + "=" + SCOPE_NAME + "." + it.value + ";}" );
                    }
                    if ( it.key === "L_PARENTHESIS" ) {
                        isParamHeader = true;
                    }
                    if ( it.key === "R_PARENTHESIS" ) {
                        isParamHeader    = false;
                        isFilterFunction = false;
                    }
                    function updateFn( replacement ) {
                        fnString = replacement + fnString;
                        appendix += replacement.length;
                        fnString = replaceAt( fnString, appendix, it.value, "v" + varCount );
                        varCount++;
                    }

                } );
                var fn = (new Function( "$filter", "\"use strict\";return function(" + SCOPE_NAME + "," + EXTRA_NAME + ") {try { " + fnString + "; \r\n } catch( e ){ console.error(e);return undefined; } }" ));
                return fn( $filter );
            }
        } ];
        return this;
    }


    window.F = new Module( "fancy", "body", {} );


    Fancy.template     = "1.0.0";
    Fancy.api.template = function ( name, scope ) {
        return this.set( "FancyTemplate", function ( el ) {
            return new Module( name, el, scope );
        }, true );
    };

})();