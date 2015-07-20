// profile-create.js

jQuery(function($){
    var profile;
    $('#profile-dialog').modal({
        show: false,
        backdrop: false
    }).on('shown.bs.modal', function () {
        $('#name').focus()
    });
    $('#store').on('click', showProfile);
    $('#profile-form').submit(function(event){
        event.preventDefault();
        var slug = calli.slugify($('#name').val());
        var path = event.target.action.replace(/\?.*/,'');
        var resource = path + slug;
        event.target.setAttribute("resource", resource);
        calli.postTurtle(event.target.action, calli.copyResourceData(event.target)).then(function(profile){
            $('#screen-form').attr("action", profile + "?create=" + encodeURIComponent($('#Screen').prop('href')));
            return screener.setProfile(profile + "?view");
        }).then(function(){
            $('#store').off('click', showProfile);
            $('#profile-dialog').modal('hide');
            $('#label-dialog').modal('show');
        });
    });
    calli.getCurrentUserName().then(function(username){
        if (!$('#name').val() && username) $('#name').val(username.replace(/@.*/,''));
    }).then(function(){
        return calli.getCurrentUserAccount();
    }).then(function(iri){
        if (!iri) window.location.replace("/?login&return_to=" + encodeURIComponent(window.location.href));
        $('#members').empty().append($('<span></span>', {
            resource: iri
        }));
    });
    function showProfile(event){
        event.stopImmediatePropagation();
        $('#profile-dialog').modal('show');
    }
});