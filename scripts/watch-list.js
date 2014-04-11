// watch-list.js
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
    (function(){
        screener.listExchanges().then(function(result){
            var exchange = $('[rel="screener:ofExchange"] [about]').attr('about');
            $('#exchange-select').append(result.map(function(exchange){
                return $('<option></option>', {
                    value: exchange.iri
                }).text(exchange.label);
            })).val(exchange).change();
        }).catch(calli.error);
        $('#exchange-select').change(function(event){
            if (event.target.value) {
                $('[rel="screener:ofExchange"]').empty().append($('<span></span>', {
                    about: event.target.value
                }));
            }
            screener.listSectors(event.target.value).then(function(result){
                var values = $('[property="screener:includeSector"]').toArray().map(function(span){
                    return span.getAttribute("content");
                }).concat($('#sectors input:checked').toArray().map(function(input){
                    return input.value;
                }));
                $('#sectors').empty().append($(result.map(function(sector){
                    return $('<div></div>', {
                        "class": "checkbox"
                    }).append($('<label></label>').append($('<input/>', {
                        type: "checkbox",
                        value: sector,
                        checked: values.indexOf(sector) >= 0 ? "checked" : undefined
                    })).append(document.createTextNode(sector)))[0];
                })).change(whenEnabled(_.debounce(function(event){
                    var values = $('#sectors input:checked').toArray().map(function(input){
                        return input.value;
                    });
                    $('#sector-span').empty().append(values.map(function(value){
                        return $('<span></span>', {
                            property: "screener:includeSector",
                            content: value
                        });
                    }));
                    populate_list();
                }, 1000))));
            }).catch(calli.error);
        });

        var exchange = $('[rel="screener:ofExchange"] [about]').attr('about');
        $("#include-tickers").val(_.map($('[rel="screener:include"]').find("[resource]").toArray(), function(elem){
            var security = elem.getAttribute("resource");
            if (security.indexOf(exchange) === 0) {
                return security.substring(exchange.length + 1);
            } else {
                return security;
            }
        }).join(' '));
        $("#exclude-tickers").val(_.map($('[rel="screener:exclude"]').find("[resource]").toArray(), function(elem){
            var security = elem.getAttribute("resource");
            if (security.indexOf(exchange) === 0) {
                return security.substring(exchange.length + 1);
            } else {
                return security;
            }
        }).join(' '));
        populate_list();
    })();
    $('#include-tickers').change(whenEnabled(function(event){
        if (event.target.value) {
            appendSecurities($('[rel="screener:include"]'), event.target.value.split(/[\s,]+/));
        } else {
            $('[rel="screener:include"]').empty();
        }
        populate_list();
    }));
    $('#exclude-tickers').change(whenEnabled(function(event){
        if (event.target.value) {
            appendSecurities($('[rel="screener:exclude"]'), event.target.value.split(/[\s,]+/));
        } else {
            $('[rel="screener:exclude"]').empty();
        }
        populate_list();
    }));

    function populate_list(){
        var exchange = $('[rel="screener:ofExchange"] [about]').attr('about');
        var sectors = $('[property="screener:includeSector"]').toArray().map(function(span){
            return span.getAttribute("content");
        });
        screener.listSecurities(exchange, sectors).then(function(result){
            var includes = $('[rel="screener:include"]').find("[resource]").toArray().map(function(incl){
                return incl.getAttribute('resource');
            });
            var excludes = $('[rel="screener:exclude"]').find("[resource]").toArray().map(function(excl){
                return excl.getAttribute('resource');
            });
            var filtered = includes.concat(_.reject(result, _.contains.bind(this, excludes))).sort();
            $('#sector-security-list').empty().append(filtered.map(function(security){
                var ticker = security.substring(exchange.length + 1);
                return $('<li></li>').append($('<a></a>', {
                    href: security,
                    target: $('#sector-security-list').closest('form').length ? "_blank" : "_self"
                }).text(ticker));
            }));
        }).catch(calli.error);
    }

    function whenEnabled(func) {
        return function() {
            if (!$(this).is(":disabled")) {
                func.apply(this, arguments);
            }
        };
    }

    function appendSecurities(container, list) {
        var exchange = $('[rel="screener:ofExchange"] [about]').attr('about');
        container.empty().append(_.map(_.compact(list).sort(), function(ticker){
            return $('<li></li>', {
                resource: exchange + '/' + encodeURI(ticker)
            }).text(ticker);
        }));
    }
});
