(function ( window ) {
    var IDENTIFIER = /^[a-zA-Z][a-zA-Z0-9]*/;
    var NUMBER     = /^-?[0-9]+(\.[0-9]+)?/;
    var COMMENT    = /^\/\/.*/;
    var WHITESPACE = /^[^\n\S]+/;
    var INDENT     = /^(?:\n[^\n\S]*)+/;
    var OPTABLE    = {
        '+' : 'PLUS',
        '-' : 'MINUS',
        '*' : 'MULTIPLY',
        '.' : 'DOT',
        '\\': 'BACKSLASH',
        ':' : 'COLON',
        '%' : 'PERCENT',
        '|' : 'PIPE',
        '!' : 'EXCLAMATION',
        '?' : 'QUESTION',
        '#' : 'POUND',
        '&' : 'AMPERSAND',
        ';' : 'SEMI',
        ',' : 'COMMA',
        '(' : 'L_PARENTHESIS',
        ')' : 'R_PARENTHESIS',
        '<' : 'L_ANG',
        '>' : 'R_ANG',
        '{' : 'L_BRACE',
        '}' : 'R_BRACE',
        '[' : 'L_BRACKET',
        ']' : 'R_BRACKET',
        '=' : 'EQUALS'
    };


    function Lexer( expression ) {
        if ( !(this instanceof Lexer) ) {
            return new Lexer( expression );
        }
        this.tokens = [];
        this.indent = 0;
        this.chunk  = undefined;
        return this.tokenise( expression );
    }

    Lexer.api = Lexer.prototype = {};
    Lexer.api.identifier = function () {
        var value,
            token = IDENTIFIER.exec( this.chunk );
        if ( token ) {
            value = token[ 0 ];
            this.tokens.push( [ "IDENTIFIER", value ] );
            return value.length;
        }

        return 0;
    };
    Lexer.api.number     = function () {
        var token = NUMBER.exec( this.chunk );
        if ( token ) {
            this.tokens.push( [ 'NUMBER', token[ 0 ] ] );
            return token[ 0 ].length;
        }

        return 0;
    };
    Lexer.api.string     = function () {
        var firstChar = this.chunk.charAt( 0 ),
            quoted    = false,
            nextChar;
        if ( firstChar == '"' || firstChar == "'" ) {
            for ( var i = 1; i < this.chunk.length; i++ ) {
                if ( !quoted ) {
                    nextChar = this.chunk.charAt( i );
                    if ( nextChar == "\\" ) {
                        quoted = true;
                    } else if ( nextChar == firstChar ) {
                        this.tokens.push( [ 'STRING', this.chunk.substring( 0, i + 1 ) ] );
                        return i + 1;
                    }
                } else {
                    quoted = false;
                }
            }
        }

        return 0;
    };
    Lexer.api.comment    = function () {
        var token = COMMENT.exec( this.chunk );
        if ( token ) {
            this.tokens.push( [ 'COMMENT', token[ 0 ] ] );
            return token[ 0 ].length;
        }

        return 0;
    };
    Lexer.api.whitespace = function () {
        var token = WHITESPACE.exec( this.chunk );
        if ( token ) {
            return token[ 0 ].length;
        }

        return 0;
    };
    Lexer.api.line       = function () {
        var token = INDENT.exec( this.chunk );
        if ( token ) {
            var lastNewline = token[ 0 ].lastIndexOf( "\n" ) + 1;
            var size        = token[ 0 ].length - lastNewline;
            if ( size > this.indent ) {
                this.tokens.push( [ 'INDENT', size - this.indent ] );
            } else {
                if ( size < this.indent ) {
                    this.tokens.push( [ 'OUTDENT', this.indent - size ] );
                }
                this.tokens.push( [ 'TERMINATOR', token[ 0 ].substring( 0, lastNewline ) ] );
            }
            this.indent = size;
            return token[ 0 ].length;
        }

        return 0;
    };
    Lexer.api.literal    = function () {
        var tag = this.chunk.slice( 0, 1 );
        if ( OPTABLE[ tag ] ) {
            this.tokens.push( [ OPTABLE[ tag ], tag ] );
            return 1;
        }

        return 0;
    };
    Lexer.api.tokenise   = function ( source ) {
        var i = 0;
        while ( this.chunk = source.slice( i ) ) {
            var diff = this.identifier() || this.number() || this.string() || this.comment() || this.whitespace() || this.line() || this.literal();
            if ( !diff ) {
                console.error( "Couldn't tokenise: " + this.chunk + " near \"" + source.slice( Math.max( 0, i - 15 ), i + 15 ) + "\"" );
                return;
            }
            i += diff;
        }

        return this.tokens;
    };
    window.Lexer         = Lexer;
})( window );
(function ( $ ) {
    Fancy.require( {
        jQuery: false,
        Fancy : "1.1.0"
    } );
    var id            = 0,
        NAME          = "FancyTemplate",
        VERSION       = "0.0.3",
        templateCache = {},
        FILTER        = {},
        SINGLETAGS    = [ "br", "link", "img", "meta", "param", "input", "source", "track" ],
        STRIPTAGS     = [ "b", "i", "u" ],
        NODETYPE      = {
            comment: 8,
            text   : 3
        },
        logged        = false;

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

        var lexer = new Lexer( expression );
        var error = false;
        lexer.forEach( function ( it, i ) {
            if ( !error ) {
                if ( parse( it, i, lexer ) ) {
                    throw new FancyTemplateError( "Eval", "Syntax Error: Token '" + it[ 1 ] + "' is an unexpected token at " + expression );
                    return error = true;
                }
                if ( it[ 0 ] === "IDENTIFIER" && (lexer[ i - 1 ] ? lexer[ i - 1 ][ 0 ] !== "DOT" : true) ) {
                    expression = expression.replace( it[ 1 ], "this." + it[ 1 ] );
                }
            }
        } );

        if ( !error ) {
            return (new Function( " try{ return " + expression + "; \r\n } catch(e){return '';}" )).call( scope );
        }
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


    function FancyTemplateError( type, msg ) {
        return new Error( "[" + type + "]: " + msg );
    }

    function FancyTemplate( $el, settings ) {
        var SELF      = this;
        this.element  = $el;
        this.settings = $.extend( {}, Fancy.settings [ NAME ], settings );
        this.id       = id++;
        this.parsed   = [];
        if ( !logged ) {
            logged = true;
            Fancy.version( SELF );
        }
        this.element.on( "DOMNodeInserted." + NAME, function () {
            SELF.compile();
        } );

        return this;
    }

    FancyTemplate.api = FancyTemplate.prototype = {};
    FancyTemplate.api.version = VERSION;
    FancyTemplate.api.name    = NAME;
    FancyTemplate.api.update  = function ( scope ) {
        var SELF = this;
        if ( scope ) {
            SELF.settings.scope = scope;
        }
        this.parse();
        return this;
    };

    FancyTemplate.api.parse = function () {
        var SELF = this,
            l    = this.settings.leftDelimiter,
            r    = this.settings.rightDelimiter;
        this.parsed.forEach( function ( it ) {
            var expressions = getExpression( l, r );
            it.parsed       = it.expression.replace( expressions, function ( match, $1 ) {
                return FancyTemplate.eval( SELF.settings.scope, $1 );
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

    FancyTemplate.eval = function ( scope, expression ) {
        var evaluated = null;
        // only properties
        if ( expression.match( new RegExp( "\\S+\\|(\\w)*" ) ) ) {
            evaluated = FancyTemplate.filter( scope, expression.match( /\|(\w*)/ )[ 1 ], $eval( scope, expression.split( "|" )[ 0 ] ), expression.split( "|" )[ 1 ] );
        } else {
            evaluated = $eval( scope, expression );
        }
        if ( Fancy.getType( evaluated ) === "null" || Fancy.getType( evaluated ) === "undefined" ) {
            return "";
        }
        return evaluated;
    };

    FancyTemplate.filter = function ( scope, name, value, filter ) {
        if ( !FILTER[ name ] ) {
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
            return FILTER[ name ].apply( this, args );
        } catch ( e ) {
            return value;
        }
    };

    FancyTemplate.api.compile = function () {
        var SELF = this,
            nodes;

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

    FancyTemplate.api.destroy = function () {
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

    Fancy.settings [ NAME ] = {
        scope         : {},
        leftDelimiter : "{{",
        rightDelimiter: "}}",
        bindClass     : NAME + "-bindings"
    };

    Fancy.templateFilter     = function ( name, filter ) {
        if ( Fancy.getType( filter ) === "function" ) {
            FILTER[ name ] = filter;
        } else {
            console.error( "You can define " + (name || "a filter") + " only as function!" );
        }
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