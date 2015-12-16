(function ( Fancy ) {
    var SCOPE_NAME = "s",
        EXTRA_NAME = "l",
        ROOT_NAME  = SCOPE_NAME + ".$root";

    function FancyEvalError( type, msg ) {
        return new Error( "[" + type + "]: " + msg );
    }

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

    function FancyParse( $expression ) {
        var lexer    = new Fancy.lexer( $expression ),
            appendix = 0;

        function _in( o, v ) {
            return '(' + o + ' && "' + v + '" in ' + o + ')';
        }

        var varCount      = 0,
            fnString      = "return " + $expression.trim(),
            isParamHeader = false;
        lexer.forEach( function ( it, i ) {
            var isParameter = it.key === "IDENTIFIER" && !isKeyword( it.value ),
                isAssign    = (lexer[ i + 1 ] ? lexer[ i + 1 ].key === "EQUALS" : false) && (lexer[ i + 2 ] ? lexer[ i + 2 ].key !== "EQUALS" : false),
                firstPart   = (lexer[ i - 1 ] ? lexer[ i - 1 ].key !== "DOT" : true);
            if ( isParameter && isAssign ) {
                var replacement = "" + SCOPE_NAME + "." + it.value;
                fnString        = replaceAt( fnString, appendix, it.value, replacement );
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
                isParamHeader = false;
            }
            function updateFn( replacement ) {
                fnString = replacement + fnString;
                appendix += replacement.length;
                fnString = replaceAt( fnString, appendix, it.value, "v" + varCount );
                varCount++;
            }

        } );
        var fn            = (new Function( "\"use strict\";return function(" + SCOPE_NAME + "," + EXTRA_NAME + ") {try { " + fnString + "; \r\n } catch( e ){ return undefined; } }" ));
        return fn();
    }


    function FancyEval( $expression ) {
        return FancyParse( $expression );
    }

    Fancy.eval  = function ( expression, scope ) {
        return new FancyEval( expression, scope );
    };
    Fancy.parse = function ( expression ) {
        return new FancyParse( expression );
    };
})( Fancy );

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
        SELF.directive( "fancyClick", function () {
            return {
                restrict: "A",
                scope   : false,
                link    : function ( $scope, $el, $attr ) {
                    $el.on( "click", function ( e ) {
                        var click = Fancy.parse( $attr.fancyClick );
                        click( SELF.settings.scope, { $event: e } );
                        SELF.update();
                    } );
                }
            };
        } );
    }, function ( SELF ) {
        SELF.directive( "fancyEach", function () {
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

                    SELF.watch( $attr.fancyEach.split( "in" )[ 1 ], reload );
                    function reload() {
                        var items = Fancy.parse( $attr.fancyEach.split( "in" )[ 1 ] )( $scope.$parent );
                        items.forEach( function ( it ) {
                            var tpl = el.clone();
                            tpl.html( JSON.stringify( it ) );
                            commentEnd.before( tpl );
                        } );
                    }

                }
            };
        } );
    } );

    function FancyTemplate( $el, settings ) {
        var SELF         = this;
        this.element     = $el;
        this.settings    = $.extend( {}, Fancy.settings [ NAME ], settings );
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
        return this;
    }

    FancyTemplate.api = FancyTemplate.prototype = {};
    FancyTemplate.api.version   = VERSION;
    FancyTemplate.api.name      = NAME;
    FancyTemplate.api.update    = function ( scope ) {
        var SELF = this;
        if ( scope ) {
            SELF.settings.scope = scope;
        }
        this.parse();
        return this;
    };
    FancyTemplate.api.parse     = function () {
        var SELF = this,
            l    = this.settings.leftDelimiter,
            r    = this.settings.rightDelimiter;
        this.parsed.forEach( function ( it ) {
            var expressions   = getExpression( l, r );
            it.parsed         = it.expression.replace( expressions, function ( match, $1 ) {
                return SELF.eval( $1 );
            } );
            it.node.nodeValue = it.parsed;
            if ( it.nodeType === NODETYPE.comment && it.node.nodeType === it.nodeType ) {
                var newNode           = $( document.createTextNode( it.parsed ) );
                $( it.node ).replaceWith( newNode );
                SELF.parsed[ i ].node = newNode[ 0 ];
            }
        } );

        this.$listener.forEach( function ( it, i ) {
            var value = Fancy.parse( it.value )( SELF.settings.scope );
            console.log( value, it.last )
            if ( Fancy.getType( value ) !== Fancy.getType( it.last ) ) {
                it.callback.call( SELF, value, it.last );
                SELF.$listener[ i ].last = value;
                return;
            }
            switch ( Fancy.getType( value ) ) {
                case "array":
                    if ( value.length !== it.last.length ) {
                        it.callback.call( SELF, value, it.last );
                    }
            }
            SELF.$listener[ i ].last = value;
        } );
        return this;
    };
    FancyTemplate.api.eval      = function ( expression ) {
        var evaluated = null,
            SELF      = this;
        // only properties
        if ( expression.match( new RegExp( "\\S+\\|(\\w)*" ) ) ) {
            evaluated = (function ( scope, name, value, filter ) {
                if ( !SELF.$filter[ name ] ) {
                    console.error( "You didn't define " + (name || "the filter") );
                    return value;
                }
                var args    = [ value ];
                var filters = filter.replace( name, "" ).split( ":" );
                filters.splice( 0, 1 );
                try {
                    filters.forEach( function ( it ) {
                        args.push( Fancy.eval( it )( scope ) );
                    } );
                    return SELF.$filter[ name ].apply( this, args );
                } catch ( e ) {
                    return value;
                }
            })( SELF.settings.scope, expression.match( /\|(\w*)/ )[ 1 ], Fancy.eval( expression.split( "|" )[ 0 ] )( SELF.settings.scope ), expression.split( "|" )[ 1 ] );
        } else {
            evaluated = Fancy.eval( expression )( SELF.settings.scope );
        }
        if ( Fancy.undefined( evaluated ) ) {
            return "";
        }
        return evaluated;
    };
    FancyTemplate.api.compile   = function () {
        var SELF = this,
            nodes;
        SELF.$directives.forEach( function ( directive ) {
            directive.elements = directive.elements || [];
            if ( ~directive.restrict.indexOf( "A" ) ) {
                var elements = SELF.element.find( "[" + directive.name + "]" );
                elements.each( function ( index, $el ) {
                    if ( ~$( directive.elements ).index( $el ) ) {
                        return;
                    }
                    directive.elements.push( $el );
                    var scope = SELF.settings.scope;
                    if ( directive.scope ) {
                        scope = {
                            $parent: SELF.settings.scope
                        };
                        each( directive.scope, function ( prop, o ) {
                            switch ( this[ 0 ] ) {
                                case "&":
                                    scope[ prop ] = function ( options ) {
                                        var attr = $( $el ).attr( o.length > 1 ? toDashCase( o.substr( 1 ) ) : prop );
                                        var fn   = Fancy.parse( attr );
                                        fn( scope, options );
                                        SELF.update();
                                    };
                                    break;
                            }
                        } );
                    }
                    var attrs    = {};
                    $A( $el.attributes ).forEach( function ( attr ) {
                        attrs[ toCamelCase( attr.name ) ] = attr.nodeValue;
                    } );
                    var template = Fancy( this ).template( { scope: scope } );
                    directive.link( scope, $( this ), attrs );
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

        function getCommentNodesIn( node ) {
            var commentNodes = [], nonWhitespaceMatcher = /\S/;

            function getCommentNodes( node ) {
                if ( node.nodeType === NODETYPE.comment ) {
                    if ( nonWhitespaceMatcher.test( node.nodeValue ) ) {
                        commentNodes.push( node );
                    }
                } else if ( node.childNodes ) {
                    for ( var i = 0, len = node.childNodes.length; i < len; ++i ) {
                        getCommentNodes( node.childNodes[ i ] );
                    }
                }
            }

            getCommentNodes( node );
            return commentNodes;
        }

        if ( ~SELF.settings.leftDelimiter.indexOf( "<!" ) ) {
            nodes                        = getCommentNodesIn( this.element[ 0 ] );
            SELF.settings.leftDelimiter  = "<!--";
            SELF.settings.rightDelimiter = ">";
            nodes.forEach( function ( it ) {
                var nodeValue = "<!--" + it.nodeValue + ">";
                if ( nodeValue.match( getExpression( SELF.settings.leftDelimiter, SELF.settings.rightDelimiter ) ) ) {
                    SELF.parsed.push( { expression: nodeValue, node: it, nodeType: it.nodeType } );
                }
            } );
        } else {
            nodes = getTextNodesIn( this.element[ 0 ] );
            nodes.forEach( function ( it ) {
                if ( it.nodeValue.match( getExpression( SELF.settings.leftDelimiter, SELF.settings.rightDelimiter ) ) ) {
                    SELF.parsed.push( { expression: it.nodeValue, node: it, nodeType: it.nodeType } );
                }
            } );
        }

        return this.parse();
    };
    FancyTemplate.api.destroy   = function () {
        this.element.off( "DOMNodeInserted." + NAME );
        this.parsed.forEach( function ( it ) {
            if ( it.nodeType === NODETYPE.comment ) {
                var newNode = $( document.createComment( it.expression.replace( "<!--", "" ).replace( ">", "" ) ) );
                $( it.node ).replaceWith( newNode );
            } else {
                it.node.nodeValue = it.expression;
            }
        } );
        this.element.removeData( NAME );
        return null;
    };
    FancyTemplate.api.filter    = function ( name, filter ) {
        if ( Fancy.getType( filter ) === "function" ) {
            this.$filter[ name ] = filter;
        } else {
            console.error( "You can define " + (name || "a filter") + " only as function!" );
        }
    };
    FancyTemplate.api.directive = function ( name, directive ) {
        var d  = directive.call( this );
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
        this.$directives.push( d );
    };
    FancyTemplate.api.watch     = function ( expression, callback ) {
        var SELF  = this;
        var value = Fancy.parse( expression )( SELF.settings.scope );
        SELF.$listener.push( {
            value   : expression,
            last    : value,
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