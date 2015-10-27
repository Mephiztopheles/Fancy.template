(function( $ ) {

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

    function $eval( scope, expression ) {
        var mask = {};
        for( var p in this ) {
            mask[ p ] = undefined;
        }
        $.extend( mask, scope );
        mask.Date = Date;
        if( expression.match( /=[^= ]+/ ) || expression.match( /\s*var / ) || expression.match( /[^=]=[^=]/ ) ) {
            console.error( "you are not allowed to create variables here: " + expression );
            return undefined;
        }
        return (new Function( "with(this){ try{ return " + expression + "; \r\n } catch(e){return '';} }" )).call( mask );
    }

    function getExpression( l, r ) {
        var L = escapeRegExp( l ),
            R = escapeRegExp( r );
        return new RegExp( "(?:" + L + ")([^" + L + R + "]*)(?:" + R + ")", "g" );
    }

    function FancyTemplate( $el, settings ) {
        var SELF      = this;
        this.element  = $el;
        this.settings = $.extend( {}, Fancy.settings [ NAME ], settings );
        this.id       = id++;
        this.parsed   = [];
        if( !logged ) {
            logged = true;
            Fancy.version( SELF );
        }
        this.element.on( "DOMNodeInserted." + NAME, function() {
            SELF.compile();
        } );

        return this;
    }

    FancyTemplate.api = FancyTemplate.prototype = {};
    FancyTemplate.api.version = VERSION;
    FancyTemplate.api.name    = NAME;
    FancyTemplate.api.update  = function( scope ) {
        var SELF = this;
        if( scope ) {
            SELF.settings.scope = scope;
        }
        this.parse();
        return this;
    };

    FancyTemplate.api.parse = function() {
        var SELF = this,
            l    = this.settings.leftDelimiter,
            r    = this.settings.rightDelimiter;
        this.parsed.forEach( function( it, i ) {
            var expressions   = getExpression( l, r );
            it.node.nodeValue = it.expression.replace( expressions, function( match, $1 ) {
                return FancyTemplate.eval( SELF.settings.scope, $1 );
            } );
            if( it.nodeType === NODETYPE.comment && it.node.nodeType === it.nodeType ) {
                var newNode           = $( document.createTextNode( it.node.nodeValue ) );
                $( it.node ).replaceWith( newNode );
                SELF.parsed[ i ].node = newNode[ 0 ];
            }
        } );
        return this;
    };

    FancyTemplate.eval = function( scope, expression ) {
        var evaluated = null;
        // only properties
        if( expression.match( new RegExp( "\\S+\\|(\\w)*" ) ) ) {
            evaluated = FancyTemplate.filter( scope, expression.match( /\|(\w*)/ )[ 1 ], $eval( scope, expression.split( "|" )[ 0 ] ), expression.split( "|" )[ 1 ] );
        } else {
            evaluated = $eval( scope, expression );
        }
        if( Fancy.getType( evaluated ) === "null" || Fancy.getType( evaluated ) === "undefined" ) {
            return "";
        }
        return evaluated;
    };

    FancyTemplate.filter = function( scope, name, value, filter ) {
        if( !FILTER[ name ] ) {
            console.error( "You didn't define " + (name || "the filter") );
            return value;
        }
        var args    = [ value ];
        var filters = filter.replace( name, "" ).split( ":" );
        filters.splice( 0, 1 );
        try {
            filters.forEach( function( it ) {
                args.push( $eval( scope, it ) );
            } );
            return FILTER[ name ].apply( this, args );
        } catch( e ) {
            return value;
        }
    };

    FancyTemplate.api.compile = function() {
        var SELF = this,
            nodes;

        function getTextNodesIn( node ) {
            var textNodes = [], nonWhitespaceMatcher = /\S/;

            function getTextNodes( node ) {
                if( node.nodeType == NODETYPE.text ) {
                    if( nonWhitespaceMatcher.test( node.nodeValue ) ) {
                        textNodes.push( node );
                    }
                } else if( node.childNodes ) {
                    for( var i = 0, len = node.childNodes.length; i < len; ++i ) {
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
                if( node.nodeType === NODETYPE.comment ) {
                    if( nonWhitespaceMatcher.test( node.nodeValue ) ) {
                        commentNodes.push( node );
                    }
                } else if( node.childNodes ) {
                    for( var i = 0, len = node.childNodes.length; i < len; ++i ) {
                        getCommentNodes( node.childNodes[ i ] );
                    }
                }
            }

            getCommentNodes( node );
            return commentNodes;
        }

        if( ~SELF.settings.leftDelimiter.indexOf( "<!" ) ) {
            nodes                        = getCommentNodesIn( this.element[ 0 ] );
            SELF.settings.leftDelimiter  = "<!--";
            SELF.settings.rightDelimiter = ">";
            nodes.forEach( function( it ) {
                var nodeValue = "<!--" + it.nodeValue + ">";
                if( nodeValue.match( getExpression( SELF.settings.leftDelimiter, SELF.settings.rightDelimiter ) ) ) {
                    SELF.parsed.push( { expression: nodeValue, node: it, nodeType: it.nodeType } );
                }
            } );
        } else {
            nodes = getTextNodesIn( this.element[ 0 ] );
            nodes.forEach( function( it ) {
                if( it.nodeValue.match( getExpression( SELF.settings.leftDelimiter, SELF.settings.rightDelimiter ) ) ) {
                    SELF.parsed.push( { expression: it.nodeValue, node: it, nodeType: it.nodeType } );
                }
            } );
        }

        return this.parse();
    };

    FancyTemplate.api.destroy = function() {
        this.element.off( "DOMNodeInserted." + NAME );
        this.parsed.forEach( function( it ) {
            if( it.nodeType === NODETYPE.comment ) {
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

    Fancy.templateFilter     = function( name, filter ) {
        if( Fancy.getType( filter ) === "function" ) {
            FILTER[ name ] = filter;
        } else {
            console.error( "You can define " + (name || "a filter") + " only as function!" );
        }
    };
    Fancy.forbidTemplateTags = function() {
        $A( arguments ).forEach( function( it ) {
            var index       = STRIPTAGS.indexOf( it ),
                singleIndex = SINGLETAGS.indexOf( it );
            if( index === -1 && singleIndex === -1 ) {
                STRIPTAGS.push( it );
            } else if( singleIndex !== -1 ) {
                console.error( "singletags are forbidden by default" );
            }
        } )
    };
    Fancy.allowTemplateTags  = function() {
        $A( arguments ).forEach( function( it ) {
            var index       = STRIPTAGS.indexOf( it ),
                singleIndex = SINGLETAGS.indexOf( it );
            if( index !== -1 && singleIndex === -1 ) {
                STRIPTAGS.splice( index, 1 );
            } else if( singleIndex !== -1 ) {
                console.error( "You cannot allow singletags" );
            }
        } )
    };
    Fancy.loadTemplate       = function( url ) {
        var success = function() {},
            error   = function() {};
        if( templateCache[ url ] ) {
            setTimeout( function() {
                success( templateCache[ url ].clone() );
            }, 1 );
        } else {
            $.ajax( {
                url    : url,
                global : false,
                success: function( html ) {
                    if( html.indexOf( "<" ) !== 0 ) {
                        html                 = "<span>" + html + "</span>";
                        templateCache[ url ] = $( $( html ) );
                    } else {
                        templateCache[ url ] = $( html );
                    }
                    success( templateCache[ url ].clone() );
                },
                error  : function() {
                    error.call( this, arguments );
                }
            } );
        }

        return function( then, not ) {
            success = then;
            error   = not;
        };
    };
    Fancy.template           = VERSION;
    Fancy.api.template       = function( settings ) {
        return this.set( NAME, function( el ) {
            return new FancyTemplate( el, settings );
        }, true );
    };

})
( jQuery );