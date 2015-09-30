// profile-view.js
/* 
 *  Copyright (c) 2015 James Leigh Services Inc., Some Rights Reserved
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

    if (window.location.hash.indexOf("#socket=") === 0) {
        try {
            window.localStorage.setItem("socket", window.location.hash.substring("#socket=".length));
        } catch (e) {
            if (console) console.error(e);
        }
    }
    screener.setProfile(window.location.href).catch(console.log.bind(console));

    (function(updateWatchList){
        screener.listScreens().then(function(screens){
            return screens.map(function(screen){
                return {
                    value: screen.iri,
                    text: screen.label
                };
            });
        }).then(function(options){
            $('#screen').selectize({
                options: options,
                items: screener.getItem("screen", '').split(' '),
                closeAfterSelect: true,
                create: function(input, callback) {
                    var cls = $('#Screen').prop('href');
                    var container = $('#container-resource').attr('resource') || window.location.pathname;
                    var url = container + "?create=" + encodeURIComponent(cls) + "#" + encodeURIComponent(input);
                    window.location = url;
                },
                render: {
                    item: function(data, escape) {
                        return '<div><a href="' + escape(data.value) + '">' +
                            escape(data.text) + '</a></div>';
                    }
                }
            }).change(function(event){
                screener.setItem("screen", ($(event.target).val() || []).join(' '));
            }).change(updateWatchList).change();
        });
    })(screener.debouncePromise(updateWatchList, 500));

    function updateWatchList() {
        if (_.isEmpty($('#screen').val())) return;
        $('#results-table').addClass("loading");
        return screener.listScreens().then(function(screens){
            return screens.filter(function(screen){
                return $('#screen').val().indexOf(screen.iri) >= 0;
            });
        }).then(function(screens){
            return Promise.all(screens.map(function(screen){
                return screener.screen(screen.securityClasses, screen.criteria, screen.lookback).then(function(list){
                    return list.filter(function(item){
                        return item.signal != 'stop';
                    });
                }).then(function(list){
                    return _.pluck(list, 'security');
                });
            }));
        }).then(_.flatten).then(_.uniq).then(function(securities){
            var rows = securities.map(function(security){
                // ticker
                return $('<tr></tr>', {
                    resource: security
                }).append($('<td></td>').append($('<a></a>', {
                    href: security
                }).text(decodeURIComponent(security.replace(/^.*\//,'')))));
            });
            $('#results-table tbody').empty().append(rows);
            $('#results-table').removeClass("loading");
            return Promise.all(securities.map(function(security, i){
                var tr = rows[i];
                return screener.getSecurity(security).then(function(result){
                    return tr.append($('<td></td>').text(result && result.name || ''));
                }).then(function(){
                    return screener.load(security, ['asof', 'open','high','low','close'], 'd1', 2, new Date());
                }).then(function(data){
                    if (!data.length) return;
                    var close = data[data.length-1].close;
                    var previous = data.length > 1 ? data[data.length-2].close : close;
                    var change = Math.round(10000 * (close - previous) / previous) / 100;
                    var volume = data[data.length-1].volume;
                    return tr.append($('<td></td>', {
                        "class": "text-right",
                        "title": new Date(data[data.length-1].asof).toLocaleString(),
                        "data-value": close
                    }).text(screener.formatCurrency(close))).append($('<td></td>', {
                        "class": (change < 0 ? "text-danger " : '') + "text-right",
                        "data-value": change
                    }).text(data.length > 1 && (change + '%') || '')).append($('<td></td>', {
                        "class": "text-right hidden-xs",
                        "data-value": volume
                    }).text(screener.formatNumber(volume)));
                }).then(function(){
                    var lower = new Date();
                    lower.setFullYear(lower.getFullYear() - 1);
                    return screener.load(security, ['asof', 'open','high','low','close'], 'd5', 5, lower, new Date());
                }).then(function(data){
                    var high = _.max(_.pluck(data, 'high'));
                    var low = _.min(_.pluck(data, 'low'));
                    tr.append($('<td></td>', {
                        "class": "text-right hidden-xs",
                        "data-value": high
                    }).text(screener.formatCurrency(high))).append($('<td></td>', {
                        "class": "text-right hidden-xs",
                        "data-value": low
                    }).text(screener.formatCurrency(low)));
                });
            }));
        }).then(function(){
            screener.sortTable('#results-table');
        }).catch(calli.error).then(function(){
            $('#results-table').removeClass("loading");
        });
    }
});
