/**
 *
 * Requires the database and tables setup in config/environments/test.js to exist
 * Ensure the user is present in the pgbouncer auth file too
 * TODO: Add OAuth tests.
 *
 * To run this test, ensure that cartodb_test_user_1_db metadata exists
 * in Redis for the vizzuality.cartodb.com domain
 *
 * SELECT 5
 * HSET rails:users:vizzuality id 1
 * HSET rails:users:vizzuality database_name cartodb_test_user_1_db
 *
 */
require('../helper');
var JobController = require('../../app/controllers/job_controller');

var app = require(global.settings.app_root + '/app/app')();
var assert = require('../support/assert');
var querystring = require('qs');
var metadataBackend = require('cartodb-redis')({
    host: global.settings.redis_host,
    port: global.settings.redis_port,
    max: global.settings.redisPool,
    idleTimeoutMillis: global.settings.redisIdleTimeoutMillis,
    reapIntervalMillis: global.settings.redisReapIntervalMillis
});

function payload(query) {
    return JSON.stringify({query: query});
}
function payloadSize(query) {
    return payload(query).length;
}

var minPayloadSize = payloadSize('');
var queryMaxSize = new Array(JobController.MAX_LIMIT_QUERY_SIZE_IN_BYTES - minPayloadSize + 1).join('a');
var queryTooLong = queryMaxSize.concat('a');

describe('job query limit', function() {

    function expectedErrorMessage(query) {
        return JobController.getMaxSizeErrorMessage(payload(query));
    }

    after(function (done) {
        // batch services is not activate, so we need empty the queue to avoid unexpected
        // behaviour in further tests
        metadataBackend.redisCmd(5, 'DEL', [ 'batch:queues:localhost' ], done);
    });

    it('POST /api/v2/sql/job with a invalid query size  should respond with 400 query too long', function (done){

        assert.response(app, {
            url: '/api/v2/sql/job?api_key=1234',
            headers: { 'host': 'vizzuality.cartodb.com', 'Content-Type': 'application/x-www-form-urlencoded' },
            method: 'POST',
            data: querystring.stringify({
                query: queryTooLong
            })
        }, {
            status: 400
        }, function (res) {
            var error = JSON.parse(res.body);
            assert.deepEqual(error, { error: [expectedErrorMessage(queryTooLong)] });
            done();
        });
    });

    it('PUT /api/v2/sql/job with a invalid query size  should respond with 400 query too long', function (done){

        assert.response(app, {
            url: '/api/v2/sql/job/wadus?api_key=1234',
            headers: { 'host': 'vizzuality.cartodb.com', 'Content-Type': 'application/x-www-form-urlencoded' },
            method: 'PUT',
            data: querystring.stringify({
                query: queryTooLong
            })
        }, {
            status: 400
        }, function (res) {
            var error = JSON.parse(res.body);
            assert.deepEqual(error, { error: [expectedErrorMessage(queryTooLong)] });
            done();
        });
    });

    it('POST /api/v2/sql/job with a valid query size should respond with 201 created', function (done){

        assert.response(app, {
            url: '/api/v2/sql/job?api_key=1234',
            headers: { 'host': 'vizzuality.cartodb.com', 'Content-Type': 'application/x-www-form-urlencoded' },
            method: 'POST',
            data: querystring.stringify({
                query: queryMaxSize
            })
        }, {
            status: 201
        }, function (res) {
            var job = JSON.parse(res.body);
            assert.ok(job.job_id);
            done();
        });
    });

    it('POST /api/v2/sql/job with a invalid query size should consider multiple queries', function (done){
        var queries = [queryTooLong, 'select 1'];
        assert.response(app, {
            url: '/api/v2/sql/job?api_key=1234',
            headers: { 'host': 'vizzuality.cartodb.com', 'Content-Type': 'application/x-www-form-urlencoded' },
            method: 'POST',
            data: querystring.stringify({
                query: queries
            })
        }, {
            status: 400
        }, function (res) {
            var error = JSON.parse(res.body);
            assert.deepEqual(error, { error: [expectedErrorMessage(queries)] });
            done();
        });
    });

    it('POST /api/v2/sql/job with a invalid query size should consider fallback queries/callbacks', function (done){
        var fallbackQueries = {
            query: [{
                query: queryTooLong,
                onsuccess: "SELECT * FROM untitle_table_4 limit 1"
            }, {
                query: "SELECT * FROM untitle_table_4 limit 2",
                onsuccess: "SELECT * FROM untitle_table_4 limit 3"
            }]
        };
        assert.response(app, {
            url: '/api/v2/sql/job?api_key=1234',
            headers: { 'host': 'vizzuality.cartodb.com', 'Content-Type': 'application/x-www-form-urlencoded' },
            method: 'POST',
            data: querystring.stringify({
                query: fallbackQueries
            })
        }, {
            status: 400
        }, function (res) {
            var error = JSON.parse(res.body);
            assert.deepEqual(error, { error: [expectedErrorMessage(fallbackQueries)] });
            done();
        });
    });

});
