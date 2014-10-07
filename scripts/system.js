// system.js
/* 
 *  Copyright (c) 2014 James Leigh, Some Rights Reserved
 * 
 *  Redistribution and use in source and binary forms, with or without
 *  modification, are permitted provided that the following conditions are met:
 * 
 *  1. Redistributions of source code must retain the above copyright notice,
 *  this list of conditions and the following disclaimer.
 * 
 *  2. Redistributions in binary form must reproduce the above copyright
 *  notice, this list of conditions and the following disclaimer in the
 *  documentation and/or other materials provided with the distribution.
 * 
 *  3. Neither the name of the copyright holder nor the names of its
 *  contributors may be used to endorse or promote products derived from this
 *  software without specific prior written permission.
 * 
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 *  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 *  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 *  ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 *  LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 *  CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 *  SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 *  INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 *  CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 *  ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 *  POSSIBILITY OF SUCH DAMAGE.
 */

jQuery(function($){

    new MutationObserver(function(){
        checkWatchLists();
        $('#lists').find('.typeahead:not(.tt-hint)').last().focus();
    }).observe(document.getElementById('lists'), { childList: true });
    checkWatchLists();

    new MutationObserver(function(){
        checkScreens();
        $('#screens').find('.typeahead:not(.tt-hint)').last().focus();
    }).observe(document.getElementById('screens'), { childList: true });
    checkScreens();

    $('#backtesting-asof').change(function(event){
        if (event.target.value) {
            screener.setBacktestAsOfDateString(event.target.value);
        }
    }).val(screener.getBacktestAsOfDateString());

    $('#backtesting-form').submit(function(event){
        event.preventDefault();
        backtest();
    }).submit();
    if (window == window.parent) {
        backtest();
    }

    $('#system-form').submit(function(event){
        var prefix = $(this).attr('resource') || '';
        $('[rel="screener:qualifiedScreen"]').toArray().forEach(function(qualifiedScreen){
            var screen = $(qualifiedScreen).find('[rel="screener:screen"]').attr("resource");
            if (screen) {
                $(qualifiedScreen).attr("resource", prefix + "#" + screen.substring(screen.lastIndexOf('/') + 1));
            } else {
                $(qualifiedScreen).remove();
            }
        });
    });

    function checkWatchLists() {
        $('#lists').find('.typeahead:not(.tt-hint):not(.tt-input)').typeahead(null, {
            name: 'watch-list',
            displayKey: 'label',
            source: screener.watchListLookup()
        }).on('change typeahead:selected typeahead:autocompleted', function(event){
            var group = $(event.target).closest('.form-group');
            group.removeClass('has-success has-warning has-error');
            var resource = $(event.target).closest('[resource]');
            screener.watchListLookup()(event.target.value).then(function(suggestions){
                var relationships = resource.find('.relationships');
                relationships.empty();
                suggestions.forEach(function(suggestion){
                    resource.attr('resource', suggestion.iri);
                });
                if (suggestions.length == 1) {
                    group.addClass('has-success');
                } else if (suggestions.length) {
                    group.addClass('has-warning');
                } else {
                    group.addClass('has-error');
                }
            });
        });
    }

    function checkScreens() {
        $('#screens').find('.typeahead:not(.tt-hint):not(.tt-input)').typeahead(null, {
            name: 'screen',
            displayKey: 'label',
            source: screener.screenLookup()
        }).each(function(i, input){
            var screen = $(input).closest('[resource]')
                .find('[rel="screener:screen"]').attr('resource');
            if (screen) {
                screener.screenLookup()(screen).then(_.first).then(function(screen){
                    $(input).typeahead('val', screen.label);
                });
            }
        }).on('change typeahead:selected typeahead:autocompleted', function(event){
            var group = $(event.target).closest('.form-group');
            group.removeClass('has-success has-warning has-error');
            var resource = $(event.target).closest('[resource]');
            screener.screenLookup()(event.target.value).then(function(suggestions){
                resource.find('[rel="screener:screen"]').remove();
                suggestions.forEach(function(suggestion){
                    resource.append($('<div></div>', {
                        rel: "screener:screen",
                        resource: suggestion.screen
                    }));
                });
                if (suggestions.length == 1) {
                    group.addClass('has-success');
                } else if (suggestions.length) {
                    group.addClass('has-warning');
                } else {
                    group.addClass('has-error');
                }
            });
        });
    }

    function backtest() {
        var asof = screener.getBacktestAsOf();
        screener.listExchanges().then(function(exchanges){
            var lists = $('[rel="screener:hasWatchList"]').toArray().map(function(list){
                return list.getAttribute("resource");
            });
            var screens = $('[rel="screener:screen"]').toArray().map(function(screen){
                return screen.getAttribute("resource");
            });
            return screener.screen(lists, screens, asof).then(function(result){
                $('#sector-security-list').empty().append(result.map(function(point){
                    var exchange = exchanges.filter(function(exchange){
                        return point.security.indexOf(exchange.iri) === 0;
                    })[0];
                    var ticker = point.security.substring(exchange.iri.length + 1);
                    var symbol = exchange.mic + ':' + ticker;
                    return $('<li></li>').append($('<a></a>', {
                        href: point.security,
                        target: $('#system-form').length ? "_blank" : "_self"
                    }).text(symbol));
                }));
            });
        }).catch(function(error) {
            console.log(error);
        });
    }

});
