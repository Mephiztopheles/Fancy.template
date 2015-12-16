(function ( Fancy, $ ) {
    Fancy.require( {
        jQuery: false,
        Fancy : "1.3.0"
    } );
    var id            = 0,
        NAME          = "FancyTemplate",
        VERSION       = "0.1.0",
        templateCache = {},
        SINGLETAGS    = [ "br", "link", "img", "meta", "param", "input", "source", "track" ],
        STRIPTAGS     = [ "b", "i", "u" ],
        NODETYPE      = {
            comment: 8,
            text   : 3
        },
        DIRECTIVES    = [],
        logged        = false;

    var SCOPE_NAME = "s",
        EXTRA_NAME = "l",
        ROOT_NAME  = SCOPE_NAME + ".$root";

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

    function Parse( $expression, $filter ) {
        var lexer    = new Fancy.lexer( $expression ),
            appendix = 0;

        function _in( o, v ) {
            return '(' + o + ' && "' + v + '" in ' + o + ')';
        }

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
                    updateFn( "var v" + varCount + ";if(" + _in( EXTRA_NAME, it.value ) + "){v" + varCount + "=" + EXTRA_NAME + "." + it.value + ";}else{v" + varCount + "=" + SCOPE_NAME + "." + it.value + ";}" );
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
                replacement = "$filter['" + lexer[ i + 1 ].value + "'](" + value;
                fnString    = replaceAt( fnString, appendix, value, replacement );
                fnString    = replaceAt( fnString, appendix, new RegExp( " *\\| *" + lexer[ i + 1 ].value ), "" );
                appendix += replacement.length;
            } else if ( isParameter && isAssign ) {
                replacement = "" + SCOPE_NAME + "." + it.value;
                fnString    = replaceAt( fnString, appendix, it.value, replacement );
                appendix += replacement.length;
            } else if ( isParamHeader && isParameter && firstPart ) {
                updateFn( "var v" + varCount + ";if(" + _in( EXTRA_NAME, it.value ) + "){v" + varCount + "=" + EXTRA_NAME + "." + it.value + ";}else{v" + varCount + "=" + SCOPE_NAME + "." + it.value + ";}" );
            } else if ( isParameter && firstPart ) {
                updateFn( "var v" + varCount + ";if(" + _in( SCOPE_NAME, it.value ) + "){v" + varCount + "=" + SCOPE_NAME + "." + it.value + ";}else if(" + _in( ROOT_NAME, it.value ) + "){v" + varCount + "=" + ROOT_NAME + "." + it.value + ";}" );
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
        var fn = (new Function( "$filter", "\"use strict\";return function(" + SCOPE_NAME + "," + EXTRA_NAME + ") {try { " + fnString + "; \r\n } catch( e ){ return undefined; } }" ));
        return fn( $filter );
    }


    function toDashCase( str ) {
        return str.replace( /[A-Z][a-z]/g, function ( match ) {
            return "-" + match.toLowerCase();
        } );
    }

    function toCamelCase( str ) {
        return str.replace( /([a-z])-([a-z])/g, function ( match, $1, $2 ) {
            return $1 + $2.toUpperCase();
        } );
    }

    function $A( args ) {
        return Array.prototype.slice.call( args );
    }

    function escapeRegExp( str ) {
        return str.replace( /[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&" );
    }


    function getExpression( l, r ) {
        var L = escapeRegExp( l ),
            R = escapeRegExp( r );
        return new RegExp( "(?:" + L + ")([^" + L + R + "]*)(?:" + R + ")", "g" );
    }

    function each( o, fn ) {
        for ( var i in o ) {
            if ( o.hasOwnProperty( i ) ) {
                if ( fn.call( o[ i ], i, o[ i ] ) === false ) {
                    break;
                }
            }
        }
    }

    DIRECTIVES.push( function ( SELF ) {
        addDirective( SELF, "fancyClick", function () {
            return {
                restrict: "A",
                scope   : false,
                link    : function ( $scope, $el, $attr ) {
                    $el.on( "click", function ( e ) {
                        var click = SELF.parse( $attr.fancyClick );
                        click( SELF.$scope, { $event: e } );
                        SELF.update();
                    } );
                }
            };
        } );
    }, function ( SELF ) {
        addDirective( SELF, "fancyEach", function () {
            return {
                restrict: "A",
                scope   : true,
                link    : function ( $scope, $el, $attr ) {
                    var commentStart = $( document.createComment( "fancyEach:start" ) ),
                        commentEnd   = $( document.createComment( "fancyEach:start" ) ),
                        el           = $el.clone();
                    $el.before( commentStart );
                    $el.after( commentEnd );
                    $el.remove();
                    var elements = [];
                    SELF.watch( $attr.fancyEach.split( "in" )[ 1 ], reload );
                    function reload() {
                        var items = SELF.parse( $attr.fancyEach.split( "in" )[ 1 ] )( $scope.$parent );
                        $( elements ).remove();
                        elements = [];
                        items.forEach( function ( it, index ) {
                            var tpl = el.clone();
                            elements.push( tpl[ 0 ] );
                            var scope                                          = {
                                $parent: SELF.$scope,
                                $index : index
                            };
                            scope[ $attr.fancyEach.split( "in" )[ 0 ].trim() ] = it;
                            Fancy( tpl ).template( $.extend( {}, SELF.settings, { scope: scope } ) );
                            commentEnd.before( tpl );
                        } );
                        //SELF.update();
                    }

                    reload();
                }
            };
        } );
    } );

    function addFilter( SELF, name, filter ) {
        if ( Fancy.getType( filter ) === "function" ) {
            SELF.$filter[ name ] = filter;
        } else {
            console.error( "You can define " + (name || "a filter") + " only as function!" );
        }
    }

    function update( SELF, list ) {
        var l = SELF.settings.leftDelimiter,
            r = SELF.settings.rightDelimiter;
        list.forEach( function ( it ) {
            var expressions   = getExpression( l, r );
            it.parsed         = it.expression.replace( expressions, function ( match, $1 ) {
                var evaluated = SELF.eval( $1 );
                return Fancy.undefined( evaluated ) ? "" : evaluated;
            } );
            it.node.nodeValue = it.parsed;
        } );
        return this;
    }


    function addDirective( SELF, name, directive ) {
        var d  = directive.call( SELF );
        d.name = toDashCase( name );
        if ( Fancy.getType( d.restrict ) === "string" ) {
            d.restrict = (function ( list ) {
                var l = [];
                list.forEach( function ( item ) {
                    if ( !~l.indexOf( item.toUpperCase() ) ) {
                        l.push( item.toUpperCase() );
                    }
                } );
                return l;
            })( d.restrict.split( "" ) );
        } else {
            d.restrict = [ "A" ];
        }
        SELF.$directives.push( d );
    }

    function FancyTemplate( $el, settings ) {
        var SELF      = this;
        this.element  = $el;
        this.settings = $.extend( {}, Fancy.settings [ NAME ] );
        each( settings, function ( prop ) {
            if ( prop === "scope" ) {
                SELF.$scope = this;
            } else {
                SELF.settings[ prop ] = this;
            }
        } );
        this.id          = id++;
        this.parsed      = [];
        this.$filter     = {};
        this.$directives = [];
        this.$listener   = [];
        if ( !logged ) {
            logged = true;
            Fancy.version( this );
        }
        DIRECTIVES.forEach( function ( dir ) {
            dir( SELF );
        } );

        each( this.settings.filter, function ( name ) {
            addFilter( SELF, name, this );
        } );
        each( this.settings.directives, function ( name ) {
            addDirective( SELF, name, this );
        } );

        this.compile( $el );
        this.update();

        return this;
    }

    FancyTemplate.api = FancyTemplate.prototype = {};
    FancyTemplate.api.version = VERSION;
    FancyTemplate.api.name    = NAME;
    FancyTemplate.api.update  = function () {
        var SELF = this;
        update( SELF, SELF.parsed );
        SELF.$listener.forEach( function ( it, i ) {
            var value = SELF.parse( it.value )( SELF.$scope );
            if ( !Fancy.equals( value, it.last ) ) {
                it.callback.call( SELF, value, it.last );
                SELF.$listener[ i ].last = Fancy.copy( value, true );
                update( SELF, SELF.parsed );
            }
        } );
        return this;
    };
    FancyTemplate.api.parse   = function ( expression ) {
        return Parse( expression, this.$filter );
    };
    FancyTemplate.api.eval    = function ( $expression ) {
        return this.parse( $expression )( this.$scope );
    };
    FancyTemplate.api.compile = function ( element ) {
        var SELF = this,
            list = [],
            nodes;
        SELF.$directives.forEach( function ( directive ) {
            directive.elements = directive.elements || [];
            if ( ~directive.restrict.indexOf( "A" ) ) {
                var elements = element.find( "[" + directive.name + "]" );
                elements.each( function ( index, $el ) {
                    if ( ~$( directive.elements ).index( $el ) ) {
                        return;
                    }
                    directive.elements.push( $el );
                    var scope = SELF.$scope;
                    if ( directive.scope ) {
                        scope = {
                            $parent: SELF.$scope
                        };
                        each( directive.scope, function ( prop, o ) {
                            switch ( this[ 0 ] ) {
                                case "&":
                                    scope[ prop ] = function ( options ) {
                                        var attr = $( $el ).attr( o.length > 1 ? toDashCase( o.substr( 1 ) ) : prop );
                                        var fn   = SELF.parse( attr );
                                        fn( scope, options );
                                        SELF.update();
                                    };
                                    break;
                            }
                        } );
                    }
                    var attrs = {};
                    $A( $el.attributes ).forEach( function ( attr ) {
                        attrs[ toCamelCase( attr.name ) ] = attr.nodeValue;
                    } );
                    directive.link( scope, $( this ), attrs );
                    var template = Fancy( this ).template( { scope: scope } );
                } )
            }
        } );
        function getTextNodesIn( node ) {
            var textNodes = [], nonWhitespaceMatcher = /\S/;

            function getTextNodes( node ) {
                if ( node.nodeType == NODETYPE.text ) {
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

        nodes = getTextNodesIn( element[ 0 ] );
        nodes.forEach( function ( it ) {
            if ( it.nodeValue.match( getExpression( SELF.settings.leftDelimiter, SELF.settings.rightDelimiter ) ) ) {
                list.push( { expression: it.nodeValue, node: it, nodeType: it.nodeType } );
            }
        } );
        SELF.parsed = SELF.parsed.concat( list );

        update( SELF, list );
        return this;
    };
    FancyTemplate.api.destroy = function () {
        this.parsed.forEach( function ( it ) {
            it.node.nodeValue = it.expression;
        } );
        this.element.removeData( NAME );
        return null;
    };
    FancyTemplate.api.watch   = function ( expression, callback ) {
        var SELF  = this;
        var value = SELF.parse( expression )( SELF.$scope );
        SELF.$listener.push( {
            value   : expression,
            last    : Fancy.copy( value, true ),
            callback: callback
        } );
    };

    Fancy.settings [ NAME ] = {
        scope         : {},
        leftDelimiter : "{{",
        rightDelimiter: "}}",
        bindClass     : NAME + "-bindings"
    };

    Fancy.forbidTemplateTags = function () {
        $A( arguments ).forEach( function ( it ) {
            var index       = STRIPTAGS.indexOf( it ),
                singleIndex = SINGLETAGS.indexOf( it );
            if ( index === -1 && singleIndex === -1 ) {
                STRIPTAGS.push( it );
            } else if ( singleIndex !== -1 ) {
                console.error( "singletags are forbidden by default" );
            }
        } )
    };
    Fancy.allowTemplateTags  = function () {
        $A( arguments ).forEach( function ( it ) {
            var index       = STRIPTAGS.indexOf( it ),
                singleIndex = SINGLETAGS.indexOf( it );
            if ( index !== -1 && singleIndex === -1 ) {
                STRIPTAGS.splice( index, 1 );
            } else if ( singleIndex !== -1 ) {
                console.error( "You cannot allow singletags" );
            }
        } )
    };
    Fancy.loadTemplate       = function ( url ) {
        var success = function () {},
            error   = function () {};
        if ( templateCache[ url ] ) {
            setTimeout( function () {
                success( templateCache[ url ].clone() );
            }, 1 );
        } else {
            $.ajax( {
                url    : url,
                global : false,
                success: function ( html ) {
                    if ( html.indexOf( "<" ) !== 0 ) {
                        html                 = "<span>" + html + "</span>";
                        templateCache[ url ] = $( $( html ) );
                    } else {
                        templateCache[ url ] = $( html );
                    }
                    success( templateCache[ url ].clone() );
                },
                error  : function () {
                    error.call( this, arguments );
                }
            } );
        }

        return function ( then, not ) {
            success = then;
            error   = not;
        };
    };
    Fancy.template           = VERSION;
    Fancy.api.template       = function ( settings ) {
        return this.set( NAME, function ( el ) {
            return new FancyTemplate( el, settings );
        }, true );
    };

})( Fancy, jQuery );