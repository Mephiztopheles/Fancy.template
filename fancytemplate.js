(function() {

    Fancy.require( {
        jQuery: false,
        Fancy : "1.0.6"
    } );
    var id      = 0,
        NAME    = "FancyTemplate",
        VERSION = "1.0.0",
        logged  = false;

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
        console.trace();
        if( scope )
            SELF.settings.scope = scope;
        console.log( this.settings.scope );
        $( SELF.parsed ).each( function() {
            $( this ).html( SELF.settings.scope[ $( this ).data( "$value" ) ] );
        } );
        return this;
    };
    FancyTemplate.api.parse   = function() {
        var SELF = this,
            tpl  = $( this.template );
        function parseTemplate( it ) {
            it.data( "$value", it.text().trim() );
            it.html( it.html().replace( it.text().trim(), SELF.settings.scope[ it.data( "$value" ) ] ) );
            return it;
        }

        tpl.filter( "." + SELF.settings.bindClass ).each( function() {
            SELF.parsed.push( parseTemplate( $( this ) ) );
        } );
        return tpl;
    };
    FancyTemplate.api.compile = function() {
        var SELF      = this,
            l         = this.settings.leftDelimiter,
            r         = this.settings.rightDelimiter,
            allBut    = "[^" + l[ 0 ] + r[ r.length - 1 ] + "]*";
        this.template = this.template.replace( new RegExp( "<([^>]*)>(\\s*)" + l + "(" + allBut + ")" + r + "(\\s*)<", "gm" ), function( match, el, before, exp, after ) {
            if( el.indexOf( "script" ) === 0 )
                return;
            var tag;
            if( el.match( /class=["|']/ ) ) {
                tag = el.replace( /class="([^"]*)"/, function( match, $1 ) {
                    return "class=\"" + $1 + "\" " + SELF.settings.bindClass;
                } );
            } else {
                tag = el + " class=\"" + SELF.settings.bindClass + "\"";
            }
            return '<' + tag + '>' + before + exp + after + '<';
        } );
        this.template = this.template.replace( new RegExp( l + "(" + allBut + ")" + r, "g" ), function( match, $1 ) {
            return '<span class="' + SELF.settings.bindClass + '">' + $1.trim() + '</span>';
        } );

        this.element.html( this.parse() );
        return this;
    };

    Fancy.settings [ NAME ] = {
        scope         : {},
        leftDelimiter : "{{",
        rightDelimiter: "}}",
        bindClass     : NAME + "-bindings"
    };

    Fancy.template     = VERSION;
    Fancy.api.template = function( settings ) {
        return this.set( NAME, function( el ) {
            return new FancyTemplate( el, settings );
        }, false );
    };

})();