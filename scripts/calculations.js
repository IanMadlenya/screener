// calculations.js
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

function getCalculations() {
    var calculations;
    return calculations = {
        'unknown': function(expression) {
            return {
                getErrorMessage: function() {
                    return "Expression is unknown: " + expression;
                },
                getFields: function() {
                    return null;
                },
                getDataLength: function() {
                    return 0;
                },
                getValue: function(points) {
                    return undefined;
                }
            };
        },
        'identity': function(field) {
            return {
                getErrorMessage: function() {
                    if (!_.isString(field) || !field.match(/^[0-9a-z\_\-&]+$/))
                        return "Must be a field: " + field;
                    return null;
                },
                getFields: function() {
                    return field;
                },
                getDataLength: function() {
                    return 1;
                },
                getValue: function(points) {
                    return points[0][field];
                }
            };
        },
        'date': function(asof) {
            return {
                getErrorMessage: function() {
                    if (!_.isString(asof) || !asof.match(/^[0-9a-z_\-&]+$/))
                        return "Must be a field: " + asof;
                    return null;
                },
                getFields: function(){
                    return asof;
                },
                getDataLength: function() {
                    return 1;
                },
                getValue: function(points) {
                    var date = points[0][asof];
                    if (_.isDate(date))
                        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
                }  
            };
        },
        /* Maximum */
        MAX: function(n, field) {
            var calc = getCalculation(field, arguments, 2);
            return {
                getErrorMessage: function() {
                    if (!_.isNumber(n) || n <= 0)
                        return "Must be a positive integer: " + n;
                    return calc.getErrorMessage();
                },
                getFields: calc.getFields.bind(calc),
                getDataLength: function() {
                    return n + calc.getDataLength() - 1;
                },
                getValue: function(points) {
                    return _.max(getValues(n, calc, points));
                }
            };
        },
        /* Minimum */
        MIN: function(n, field) {
            var calc = getCalculation(field, arguments, 2);
            return {
                getErrorMessage: function() {
                    if (!_.isNumber(n) || n <= 0)
                        return "Must be a positive integer: " + n;
                    return calc.getErrorMessage();
                },
                getFields: calc.getFields.bind(calc),
                getDataLength: function() {
                    return n + calc.getDataLength() - 1;
                },
                getValue: function(points) {
                    return _.min(getValues(n, calc, points));
                }
            };
        },
        /* Age Of High */
        AOH: function(n) {
            return {
                getErrorMessage: function() {
                    if (!_.isNumber(n) || n <= 0)
                        return "Must be a positive integer: " + n;
                    return null;
                },
                getFields: function() {
                    return ['high'];
                },
                getDataLength: function() {
                    return n;
                },
                getValue: function(points) {
                    var highs = _.pluck(points, 'high');
                    var highest = _.max(highs);
                    return points.length - highs.indexOf(highest);
                }
            };
        },
        /* Convergence-Divergence Oscillator */
        CDO: function(s, l, field) {
            var args = Array.prototype.slice.call(arguments);
            var short = getCalculation(field, [s].concat(args.slice(3)));
            var long = getCalculation(field, [l].concat(args.slice(3)));
            return {
                getErrorMessage: function() {
                    if (short.getErrorMessage())
                        return short.getErrorMessage();
                    return long.getErrorMessage();
                },
                getFields: long.getFields.bind(long),
                getDataLength: function() {
                    return Math.max(short.getDataLength(), long.getDataLength());
                },
                getValue: function(points) {
                    return getValue(short, points) - getValue(long, points);
                }
            };
        },
        /* Percentage Previous Oscillator */
        PPO: function(field) {
            var calc = getCalculation(field, arguments, 1);
            return {
                getErrorMessage: calc.getErrorMessage.bind(calc),
                getFields: calc.getFields.bind(calc),
                getDataLength: function() {
                    return 1 + calc.getDataLength();
                },
                getValue: function(points) {
                    if (points.length < 2) return 0;
                    var current = getValue(calc, points);
                    var previous = getValue(calc, points.slice(0, points.length - 1));
                    return (current - previous) * 100 / previous;
                }
            };
        },
        /* Percentage Maximum Oscillator */
        PMO: function(n, field) {
            var calc = getCalculation(field, arguments, 2);
            return {
                getErrorMessage: function() {
                    if (!_.isNumber(n) || n <= 0)
                        return "Must be a positive integer: " + n;
                    return calc.getErrorMessage();
                },
                getFields: calc.getFields.bind(calc),
                getDataLength: function() {
                    return n + calc.getDataLength();
                },
                getValue: function(points) {
                    var values = getValues(n, calc, points.slice(0, points.length - 1));
                    var max = _.max(values);
                    var min = _.min(values);
                    var value = getValue(calc, points);
                    if (min < 0)
                        return (value - max) * 100 / (Math.max(max, 0) - min);
                    if (max > 0)
                        return (value - max) * 100 / max;
                    return 0;
                }
            };
        },
        /* Percentage Open Oscillator */
        POO: function(n) {
            return {
                getErrorMessage: function() {
                    if (!_.isNumber(n) || n <= 0)
                        return "Must be a positive integer: " + n;
                    return null;
                },
                getFields: function() {
                    return ['open', 'close'];
                },
                getDataLength: function() {
                    return n;
                },
                getValue: function(points) {
                    var open = _.first(points).open;
                    var close = _.last(points).close;
                    return (close - open) * 100 / open;
                }
            };
        },
        /* Percentage Low Oscillator */
        PLO: function(n) {
            return {
                getErrorMessage: function() {
                    if (!_.isNumber(n) || n <= 0)
                        return "Must be a positive integer: " + n;
                    return null;
                },
                getFields: function() {
                    return ['low', 'close'];
                },
                getDataLength: function() {
                    return n;
                },
                getValue: function(points) {
                    var lowest = _.min(_.pluck(points, 'low'));
                    var close = _.last(points).close;
                    return (close - lowest) * 100 / lowest;
                }
            };
        },
        /* Stochastic Oscillator */
        STO: function(n, s1, s2) {
            return {
                getErrorMessage: function() {
                    if (!_.isNumber(n) || n <= 0)
                        return "Must be a positive integer: " + n;
                    if (!_.isNumber(s1) || s1 <= 0)
                        return "Must be a positive integer: " + s1;
                    if (!_.isNumber(s2) || s2 <= 0)
                        return "Must be a positive integer: " + s2;
                    return null;
                },
                getFields: function() {
                    return ['high', 'low', 'close'];
                },
                getDataLength: function() {
                    return n + s1 - 1 + s2 - 1;
                },
                getValue: function(points) {
                    var p2 = _.range(s2).map(function(i) {
                        var p1 = _.range(s1).map(function(j){
                            var end = points.length - i - j;
                            return sto(points.slice(Math.max(end - n, 0), end));
                        });
                        return sum(p1) / p1.length;
                    });
                    return sum(p2) / p2.length;
                }
            };
        },
        /* Simple Moveing Average */
        'SMA': function(n, field) {
            var calc = getCalculation(field, arguments, 2);
            return {
                getErrorMessage: function() {
                    if (!_.isNumber(n) || n <= 0)
                        return "Must be a positive integer: " + n;
                    return calc.getErrorMessage();
                },
                getFields: calc.getFields.bind(calc),
                getDataLength: function() {
                    return n + calc.getDataLength() - 1;
                },
                getValue: function(points) {
                    var values = getValues(n, calc, points);
                    return sum(values) / values.length;
                }
            };
        },
        /* Exponential Moveing Average */
        'EMA': function(n, field) {
            var calc = getCalculation(field, arguments, 2);
            return {
                getErrorMessage: function() {
                    if (!_.isNumber(n) || n <= 0)
                        return "Must be a positive integer: " + n;
                    return calc.getErrorMessage();
                },
                getFields: calc.getFields.bind(calc),
                getDataLength: function() {
                    return n * 10 + calc.getDataLength() - 1;
                },
                getValue: function(points) {
                    return ema(n, getValues(n * 10, calc, points));
                }
            };
        },
        /* Piotroski F-Score */
        'F-Score': function() {
            function long_term_debt_to_asset_ratio(point) {
                if (!point['long-term_debt']) return 0;
                return point['long-term_debt'] * point.return_on_assets /
                    point.return_on_equity / point.total_stockholders_equity;
            }
            return {
                getErrorMessage: function() {
                    return null;
                },
                getFields: function() {
                    return [
                        'return_on_assets',
                        'operating_cash_flow_mil',
                        'net_income_mil',
                        'current_ratio',
                        'shares_mil',
                        'gross_margin',
                        'asset_turnover',
                        'long-term_debt',
                        'return_on_equity',
                        'total_stockholders_equity'
                    ];
                },
                getDataLength: function() {
                    return 2;
                },
                getValue: function(points) {
                    if (points.length < 2) return undefined;
                    var past = points[points.length - 1];
                    var previous = points[points.length - 2];
                    return (past.return_on_assets > 0 ? 1 : 0) +
                        (past.operating_cash_flowd_mil > 0 ? 1 : 0) +
                        (past.return_on_assets > previous.return_on_assets ? 1 : 0) +
                        (past.operating_cash_flow_mil > past.net_income_mil ? 1 : 0) + // FIXME taxes?
                        (long_term_debt_to_asset_ratio(past) < long_term_debt_to_asset_ratio(previous) ? 1 : 0) +
                        (past.current_ratio > previous.current_ratio ? 1 : 0) +
                        (past.shares_mil < previous.shares_mil ? 1 : 0) +
                        (past.gross_margin > previous.gross_margin ? 1 : 0) +
                        (past.asset_turnover > previous.asset_turnover ? 1 : 0)
                    ;
                }
            };
        },
        /* Weighted On Blanance Volume */
        OBV: function(n) {
            return {
                getErrorMessage: function() {
                    if (!_.isNumber(n) || n <= 0)
                        return "Must be a positive integer: " + n;
                    return null;
                },
                getFields: function() {
                    return 'volume';
                },
                getDataLength: function() {
                    return n * 10;
                },
                getValue: function(points) {
                    var numerator = points.reduce(function(p, point, i, points){
                        if (i === 0) return 0;
                        var prior = points[i - 1];
                        if (point.close > prior.close)
                            return p + (i + 1) * point.volume;
                        if (point.close < prior.close)
                            return p - (i + 1) * point.volume;
                        return p;
                    }, 0);
                    return numerator / (points.length * (points.length - 1)) * 2;
                }
            };
        }
    };

    function getCalculation(field, args, slice) {
        var shifted = slice ? Array.prototype.slice.call(args, slice, args.length) : args;
        return calculations[field] ?
            calculations[field].apply(this, shifted) :
            calculations.identity(field);
    }

    function getValues(size, calc, points) {
        var n = calc.getDataLength();
        var m = Math.min(size, points.length);
        return _.range(points.length - m, points.length).map(function(i){
            return calc.getValue(points.slice(Math.max(i - n + 1, 0), i + 1));
        }, null);
    }

    function getValue(calc, points) {
        var n = calc.getDataLength();
        return calc.getValue(points.slice(Math.max(points.length - n, 0), points.length));
    }

    function sto(points) {
        var highest = _.max(_.pluck(points, 'high'));
        var lowest = _.min(_.pluck(points, 'low'));
        var close = _.last(points).close;
        return (close - lowest) * 100 / (highest - lowest);
    }

    function ema(n, values) {
        var a = 2 / (n + 1);
        var firstN = _.first(values, n);
        var sma = _.reduce(firstN, function(memo, value, index){
            return memo + value;
        }, 0) / firstN.length;
        return _.reduce(values, function(memo, value, index){
            return a * value + (1 - a) * memo;
        }, sma);
    }

    function sum(values) {
        return _.reduce(values, function(memo, value){
            return memo + value;
        }, 0);
    }
}
