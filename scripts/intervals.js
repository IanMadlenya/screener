// intervals.js
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

var intervals = (function(_, moment) {
    var m1 = {
        storeName: 'm1',
        millis: 60 * 1000,
        floor: function(exchange, dateTime, amount) {
            return moment(dateTime).tz(exchange.tz).startOf('minute');
        },
        ceil: function(exchange, dateTime) {
            var start = m1.floor(exchange, dateTime);
            if (start.valueOf() < dateTime.valueOf())
                return start.add(1, 'minutes');
            return start;
        },
        inc: function(exchange, dateTime, amount) {
            if (amount < 0) throw Error("Amount must be >= 0");
            var start = m1.ceil(exchange, dateTime);
            var wd = start.isoWeekday();
            if (wd > 5)
                return m1.inc(exchange, start.add(8 - wd, 'days'), amount);
            var opens = moment.tz(start.format('YYYY-MM-DD') + 'T' + exchange.marketOpensAt, exchange.tz);
            var closes = moment.tz(start.format('YYYY-MM-DD') + 'T' + exchange.marketClosesAt, exchange.tz);
            if (start.isBefore(opens))
                return m1.inc(exchange, opens, amount);
            if (start.isAfter(closes))
                return m1.inc(exchange, opens.add(1, 'days'), amount);
            var weeks = Math.floor(amount /5 /6.5 /60);
            if (weeks)
                return m1.inc(exchange, start.add(weeks, 'weeks'), Math.round(amount - weeks *5 *6.5 *60));
            var untilClose = closes.diff(start, 'minutes');
            if (untilClose < amount)
                return m1.inc(exchange, opens.add(1, 'days'), amount - untilClose);
            return start.add('minutes', amount);
        },
        dec: function(exchange, dateTime, amount) {
            if (amount < 0) throw Error("Amount must be >= 0");
            var start = m1.floor(exchange, dateTime);
            var wd = start.isoWeekday();
            if (wd > 5)
                return m1.dec(exchange, start.subtract(wd - 5, 'days'), amount);
            var opens = moment.tz(start.format('YYYY-MM-DD') + 'T' + exchange.marketOpensAt, exchange.tz);
            var closes = moment.tz(start.format('YYYY-MM-DD') + 'T' + exchange.marketClosesAt, exchange.tz);
            if (start.isBefore(opens))
                return m1.dec(exchange, closes.subtract(1, 'days'), amount);
            if (start.isAfter(closes))
                return m1.dec(exchange, closes, amount);
            var weeks = Math.floor(amount /5 /6.5 /60);
            if (weeks)
                return m1.dec(exchange, start.subtract(weeks, 'weeks'), Math.round(amount - weeks *5 *6.5 *60));
            var sinceOpen = start.diff(opens, 'minutes');
            if (sinceOpen < amount)
                return m1.dec(exchange, closes.subtract(1, 'days'), amount - sinceOpen);
            return start.subtract('minutes', amount);
        }
    };
    var m5 = {
        derivedFrom: m1,
        storeName: 'm5',
        aggregate: 5,
        millis: 5 * 60 * 1000,
        floor: function(exchange, dateTime) {
            return moment.tz(Math.floor(dateTime.valueOf() /5 /60 /1000) *5 *60 *1000, exchange.tz);
        },
        ceil: function(exchange, dateTime) {
            return moment.tz(Math.ceil(dateTime.valueOf() /5 /60 /1000) *5 *60 *1000, exchange.tz);
        },
        inc: function(exchange, dateTime, amount) {
            return m1.inc(exchange, m5.ceil(exchange, dateTime), amount * 5);
        },
        dec: function(exchange, dateTime, amount) {
            return m1.dec(exchange, m5.floor(exchange, dateTime), amount * 5);
        }
    };
    var m10 = {
        storeName: 'm10',
        millis: 10 * 60 * 1000,
        floor: function(exchange, dateTime) {
            return moment.tz(Math.floor(dateTime.valueOf() /10 /60 /1000) *10 *60 *1000, exchange.tz);
        },
        ceil: function(exchange, dateTime) {
            return moment.tz(Math.ceil(dateTime.valueOf() /10 /60 /1000) *10 *60 *1000, exchange.tz);
        },
        inc: function(exchange, dateTime, amount) {
            return m1.inc(exchange, m10.ceil(exchange, dateTime), amount * 10);
        },
        dec: function(exchange, dateTime, amount) {
            return m1.dec(exchange, m10.floor(exchange, dateTime), amount * 10);
        }
    };
    var m30 = {
        derivedFrom: m10,
        storeName: 'm30',
        aggregate: 3,
        millis: 30 * 60 * 1000,
        floor: function(exchange, dateTime) {
            return moment.tz(Math.floor(dateTime.valueOf() /30 /60 /1000) *30 *60 *1000, exchange.tz);
        },
        ceil: function(exchange, dateTime) {
            return moment.tz(Math.ceil(dateTime.valueOf() /30 /60 /1000) *30 *60 *1000, exchange.tz);
        },
        inc: function(exchange, dateTime, amount) {
            return m1.inc(exchange, m30.ceil(exchange, dateTime), amount * 30);
        },
        dec: function(exchange, dateTime, amount) {
            return m1.dec(exchange, m30.floor(exchange, dateTime), amount * 30);
        }
    };
    var m60 = {
        storeName: 'm60',
        millis: 60 * 60 * 1000,
        floor: function(exchange, dateTime) {
            return moment(dateTime).tz(exchange.tz).startOf('hour');
        },
        ceil: function(exchange, dateTime) {
            var start = m60.floor(exchange, dateTime);
            if (start.valueOf() < dateTime.valueOf())
                return start.add(1, 'hours');
            return start;
        },
        inc: function(exchange, dateTime, amount) {
            return m1.inc(exchange, m60.ceil(exchange, dateTime), amount * 60);
        },
        dec: function(exchange, dateTime, amount) {
            return m1.dec(exchange, m60.floor(exchange, dateTime), amount * 60);
        }
    };
    var m120 = {
        derivedFrom: m60,
        storeName: 'm120',
        aggregate: 2,
        millis: 120 * 60 * 1000,
        floor: function(exchange, dateTime) {
            var start = m60.floor(exchange, dateTime);
            if (start.hour() % 2) return start.subtract(1, 'hours');
            return start;
        },
        ceil: function(exchange, dateTime) {
            var start = m60.ceil(exchange, dateTime);
            if (start.hour() % 2) return start.add(1, 'hours');
            return start;
        },
        inc: function(exchange, dateTime, amount) {
            return m1.inc(exchange, m120.ceil(exchange, dateTime), amount * 120);
        },
        dec: function(exchange, dateTime, amount) {
            return m1.dec(exchange, m120.floor(exchange, dateTime), amount * 120);
        }
    };
    var d1 = {
        storeName: 'd1',
        millis: 24 * 60 * 60 * 1000,
        floor: function(exchange, dateTime) {
            return moment(dateTime).tz(exchange.tz).startOf('day');
        },
        ceil: function(exchange, dateTime) {
            var start = d1.floor(exchange, dateTime);
            if (start.valueOf() < dateTime.valueOf())
                return start.add(1, 'days');
            return start;
        },
        inc: function(exchange, dateTime, amount) {
            var start = d1.ceil(exchange, dateTime);
            var wd = start.isoWeekday();
            if (wd > 5)
                return d1.inc(exchange, start.add(8 - wd, 'days'), amount);
            var w = Math.floor((wd + amount) / 5);
            return start.isoWeek(start.isoWeek() + w).isoWeekday(wd + amount - w * 5);
        },
        dec: function(exchange, dateTime, amount) {
            var start = d1.floor(exchange, dateTime);
            var wd = start.isoWeekday();
            if (wd > 5)
                return d1.dec(exchange, start.subtract(wd - 5, 'days'), amount);
            var w = Math.floor((wd - amount) / 5);
            return start.isoWeek(start.isoWeek() + w).isoWeekday(wd - amount - w * 5);
        }
    };
    var d5 = {
        derivedFrom: d1,
        storeName: 'd5',
        aggregate: 5,
        millis: 7 * 24 * 60 * 60 * 1000,
        floor: function(exchange, dateTime) {
            return moment(dateTime).tz(exchange.tz).startOf('isoweek');
        },
        ceil: function(exchange, dateTime) {
            var start = moment(dateTime).tz(exchange.tz).startOf('isoweek');
            if (start.valueOf() < dateTime.valueOf())
                return start.isoWeek(start.isoWeek() + 1);
            return start;
        },
        inc: function(exchange, dateTime, amount) {
            var start = d5.ceil(exchange, dateTime);
            return start.isoWeek(start.isoWeek() + amount);
        },
        dec: function(exchange, dateTime, amount) {
            var start = d5.floor(exchange, dateTime);
            return start.isoWeek(start.isoWeek() + -amount);
        }
    };
    var quarter = {
        storeName: 'quarter',
        millis: 3 * 31 * 24 * 60 * 60 * 1000,
        floor: function(exchange, dateTime) {
            return moment(dateTime).tz(exchange.tz).startOf('quarter');
        },
        ceil: function(exchange, dateTime) {
            var start = d1.floor(exchange, dateTime);
            if (start.valueOf() < dateTime())
                return start.add(3, 'months');
            return start;
        },
        inc: function(exchange, dateTime, amount) {
            var start = moment(dateTime).tz(exchange.tz).startOf('quarter');
            if (start.valueOf() < dateTime.valueOf())
                return start.add('months', 3 * (amount + 1));
            return start.add('months', 3 * amount);
        }
    };
    var annual = {
        storeName: 'annual',
        millis: 365 * 24 * 60 * 60 * 1000,
        floor: function(exchange, dateTime) {
            return moment(dateTime).tz(exchange.tz).startOf('year');
        },
        ceil: function(exchange, dateTime) {
            var start = d1.floor(exchange, dateTime);
            if (start.valueOf() < dateTime())
                return start.add(1, 'years');
            return start;
        },
        inc: function(exchange, dateTime, amount) {
            var start = moment(dateTime).tz(exchange.tz).startOf('year');
            if (start.valueOf() < dateTime.valueOf())
                return start.add('years', amount + 1);
            return start.add('years', amount);
        }
    };
    return {
        m1: m1,
        m5: m5,
        m10: m10,
        m30: m30,
        m60: m60,
        m120: m120,
        d1: d1,
        d5: d5,
        quarter: quarter,
        annual: annual
    };
})(_, moment);
