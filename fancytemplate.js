(function ( $ ) {
    Fancy.require( {
        jQuery: false,
        Fancy : "1.1.0"
    } );
    var id            = 0,
        NAME          = "FancyTemplate",
        VERSION       = "0.0.5",
        templateCache = {},
        SINGLETAGS    = [ "br", "link", "img", "meta", "param", "input", "source", "track" ],
        STRIPTAGS     = [ "b", "i", "u" ],
        NODETYPE      = {
            comment: 8,
            text   : 3
        },
        logged        = false;

    function toDashCase( str ) {
        return str.replace( /[A-Z][a-z]/g, function ( match ) {
            return "-" + match.toLowerCase();
        } );
    }

    function $A( args ) {
        return Array.prototype.slice.call( args );
    }

    function escapeRegExp( str ) {
        return str.replace( /[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&" );
    }

    function isKeyword( string ) {
        switch ( string ) {
            case "var":
            case "try":
            case "while":
            case "catch":
            case "if":
            case "new":
            case "void":
            case "this":
            case "with":
            case "throws":
            case "public":
            case "switch":
            case "eval":
            case "finally":
            case "delete":
            case "break":
            case "class":
            case "case":
            case "continue":
            case "else":
            case "default":
            case "do":
            case "private":
            case "implements":
            case "let":
            case "export":
                return true;
            default :
                return false;
        }
    }

    function $eval( scope, expression ) {

        var lexer = new Fancy.lexer( expression );
        lexer.forEach( function ( it, i ) {
            if ( parse( it, i, lexer ) ) {
                throw new FancyTemplateError( "Eval", "Syntax Error: Token '" + it[ 1 ] + "' is an unexpected token at " + expression );
            }
            if ( it[ 0 ] === "IDENTIFIER" && (lexer[ i - 1 ] ? lexer[ i - 1 ][ 0 ] !== "DOT" : true) ) {
                expression = expression.replace( it[ 1 ], "this." + it[ 1 ] + " || this.$parent." + it[ 1 ] );
            }
        } );

        return (new Function( " try{ return " + expression + "; \r\n } catch(e){return '';}" )).call( scope );
    }

    function parse( it, i, lexer ) {
        var before = lexer[ i - 1 ],
            after  = lexer[ i + 1 ];

        var keywordBefore  = (before ? before[ 0 ] !== "DOT" : false),
            keywordAfter   = (after ? after[ 0 ] !== "L_PARENTHESIS" : false),
            keyword        = isKeyword( it[ 1 ] ) && (keywordBefore || keywordAfter),
            isEqualsBefore = (before ? before[ 0 ] === "EQUALS" : false),
            isEqualsAfter  = (after ? after[ 0 ] === "EQUALS" : false),
            equals         = it[ 0 ] === "EQUALS" ? (!isEqualsAfter && !isEqualsBefore) : false;
        return keyword || equals;
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


    function FancyTemplateError( type, msg ) {
        return new Error( "[" + type + "]: " + msg );
    }

    function FancyTemplate( $el, settings ) {
        var SELF         = this;
        this.element     = $el;
        this.settings    = $.extend( {}, Fancy.settings [ NAME ], settings );
        this.id          = id++;
        this.parsed      = [];
        this.$filter     = {};
        this.$directives = [];
        if ( !logged ) {
            logged = true;
            Fancy.version( SELF );
        }
        this.element.on( "DOMNodeInserted." + NAME, function () {
            SELF.compile();
        } );
        this.directive( "fancyClick", function () {
            return {
                restrict: "A",
                scope   : { "click": "&fancyClick" },
                link    : function ( $scope, $el ) {
                    $el.on( "click", function ( e ) {
                        $scope.click( { $event: e } );
                    } );
                }
            };
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
            var expressions = getExpression( l, r );
            it.parsed       = it.expression.replace( expressions, function ( match, $1 ) {
                return SELF.eval( $1 );
            } );
        } );
        this.parsed.forEach( function ( it, i ) {
            it.node.nodeValue = it.parsed;
            if ( it.nodeType === NODETYPE.comment && it.node.nodeType === it.nodeType ) {
                var newNode           = $( document.createTextNode( it.parsed ) );
                $( it.node ).replaceWith( newNode );
                SELF.parsed[ i ].node = newNode[ 0 ];
            }
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
                        args.push( $eval( scope, it ) );
                    } );
                    return SELF.$filter[ name ].apply( this, args );
                } catch ( e ) {
                    return value;
                }
            })( SELF.settings.scope, expression.match( /\|(\w*)/ )[ 1 ], $eval( SELF.settings.scope, expression.split( "|" )[ 0 ] ), expression.split( "|" )[ 1 ] );
        } else {
            evaluated = $eval( SELF.settings.scope, expression );
        }
        if ( Fancy.getType( evaluated ) === "null" || Fancy.getType( evaluated ) === "undefined" ) {
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
                        scope           = {
                            $parent: SELF.settings.scope
                        };
                        scope.prototype = SELF.settings.scope;
                        each( directive.scope, function ( prop, o ) {
                            switch ( this[ 0 ] ) {
                                case "&":
                                    scope[ prop ] = function ( options ) {
                                        var attr = $( $el ).attr( o.length > 1 ? toDashCase( o.substr( 1 ) ) : prop );
                                        template.eval( attr );
                                        SELF.update();
                                    };
                                    break;
                            }
                        } );
                    }
                    var template = Fancy( this ).template( { scope: scope } );
                    directive.link( scope, $( this ) );
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

})( jQuery );