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
        logged        = false;

    function $eval( scope, expression ) {
        if( expression.match( /=[^= ]+/ ) ) {
            throw new Error( "you are not allowed to create variables here: " + expression )
        }
        return (new Function( "try{with(this){ return " + expression + " }}catch(e){console.log(e)}" )).call( scope );
    }

    function parseTemplate( scope, it, expression ) {
        it.html( FancyTemplate.eval( scope, expression ) );
        return it;
    }

    function FancyTemplate( $el, settings ) {
        var SELF      = this;
        this.element  = $el;
        this.template = $el.html();
        this.settings = $.extend( {}, Fancy.settings [ NAME ], settings );
        this.id       = id++;
        this.parsed   = [];
        if( !logged ) {
            logged = true;
            Fancy.version( SELF );
        }

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
        SELF.parsed.forEach( function( it ) {
            parseTemplate( SELF.settings.scope, it.html, it.expression );
        } );
        return this;
    };

    FancyTemplate.api.parse = function() {
        var SELF = this,
            tpl  = $( this.template );
        tpl.filter( "." + SELF.settings.bindClass ).add( tpl.find( "." + SELF.settings.bindClass ) ).each( function() {
            var it         = $( this ),
                expression = it.text().trim();
            SELF.parsed.push( { expression: expression, html: parseTemplate( SELF.settings.scope, it, expression ) } );
        } );
        return tpl;
    };

    FancyTemplate.eval = function( scope, expression ) {
        var regexps, evaluated;
        regexps   = {
            properties: "(\\w+\\.?\\w*)+"
        };
        evaluated = null;
        // only properties
        if( expression.match( new RegExp( "^" + regexps.properties + "\\|(\\w)*" ) ) ) {
            evaluated = FancyTemplate.filter( scope, expression.match( /\|(\w*)/ )[ 1 ], Fancy.getKey( scope, expression.split( "|" )[ 0 ] ), expression.split( "|" )[ 1 ] );
        } else {
            evaluated = $eval( scope, expression );
        }
        console.log( expression, evaluated );
        if( Fancy.getType( evaluated ) === "null" || Fancy.getType( evaluated ) === "undefined" ) {
            return "";
        }
        return evaluated;
    };

    FancyTemplate.filter = function( scope, name, value, filter ) {
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
        var SELF   = this,
            l      = this.settings.leftDelimiter,
            r      = this.settings.rightDelimiter,
            allBut = "[^" + l[ 0 ] + r[ r.length - 1 ] + "]*";

        function compile() {
            SELF.template = SELF.template.replace( new RegExp( "<([^>br]*)>(\\s*)" + l + "(" + allBut + ")" + r + "(\\s*)<", "gm" ), function( match, el, before, exp, after ) {
                if( el.indexOf( "script" ) === 0 ) {
                    return;
                }
                var tag;
                if( el.match( /class=["|']/ ) ) {
                    tag = el.replace( /class=["']([^"]*)["']/, function( match, $1 ) {
                        return "class=\"" + $1 + " " + SELF.settings.bindClass + "\"";
                    } );
                } else {
                    tag = el + " class=\"" + SELF.settings.bindClass + "\"";
                }
                return '<' + tag + '>' + before + exp + after + '<';
            } );
            SELF.template = SELF.template.replace( new RegExp( l + "(" + allBut + ")" + r, "g" ), function( match, $1 ) {
                return '<span class="' + SELF.settings.bindClass + '">' + $1.trim() + '</span>';
            } );

            SELF.element.html( SELF.parse() );
        }

        if( this.template ) {
            compile();
        } else {
            setTimeout( compile, 40 );
        }
        return this;
    };

    Fancy.settings [ NAME ] = {
        scope         : {},
        leftDelimiter : "{{",
        rightDelimiter: "}}",
        bindClass     : NAME + "-bindings"
    };

    Fancy.templateFilter = function( name, filter ) {
        FILTER[ name ] = filter;
    };
    Fancy.loadTemplate   = function( url ) {
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
    Fancy.template       = VERSION;
    Fancy.api.template   = function( settings ) {
        return this.set( NAME, function( el ) {
            return new FancyTemplate( el, settings );
        }, false );
    };

})( jQuery );