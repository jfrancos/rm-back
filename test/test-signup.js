const chai = require('chai');
const chaiHttp = require('chai-http');
const server = require('../dist/app').app;
const dbserver = require('../dist/app').server;
const should = chai.should();
const nock = require('nock')
const qs = require('querystring').stringify;
const mongodb = require ('mongodb');


const email = 'justinfrancos@gmail.com';
const password = 'ifthisislongenoughdictionarywordsarefine';
const token = 'tok_visa_debit';

chai.use(chaiHttp);


tests = [

['with weak password',                            { password: 'mypassword3', source: token, email: email }],
['with missing password',                         { email: email, source: token }],
 ['with missing token',                            { password: password, email: email}],
['with bad token',                                { password: password, email: email, source: 'asdf'}], //touches stripe
['with missing email',                            { password: password, source: token}],
['with bad email',                                { password: password, source: token, email: 'asdf'}],
['with blank email',                              { email: '', password: password, source: token}],
['with blank token',                              { email: email, password: password, source: ''}],
['with blank password',                           { email: email, password: '', source: token}],
['with card fails after successful attachment',   { email: email, password: password, source: 'tok_chargeCustomerFail' }] //touches stripe

]

// nock.recorder.rec();


describe('signup', () => {
  tests.forEach((test) => {
    describe(test[0], function() {

       it('should return an error', (done) => {   
  // nock('https://api.stripe.com', { allowUnmocked: true, encodedQueryParams:false })
  // .post('/v1/customers', qs({source:'asdf', email: email})).reply(400,{"error":{"code":"BAD_SOURCE_MOCK","type":"invalid_request_error"}})

    nock('https://api.stripe.com', { allowUnmocked: true })
  .filteringPath(() => '').delete('')
  .reply(400, {"error":{"code":"DELETION_ERROR_MOCK","type":"invalid_request_error"}})

        chai.request(server)
        .post('/signup')
        .send(test[1])
        .end(function(err, res) {
          //res.body.should.include.key('error');
          res.should.have.status(400);
          done();
        });
      }).timeout(4000);
    });
  });

  describe('with valid parameters', () => {
    it('should return 200 and no error', (done) => {
      chai.request(server)
      .post('/signup')
      .send({email: email, password: password, source: token})
      .end(function(err, res) {
        res.body.should.not.include.key('error');
        res.should.have.status(200);
        done();
      });
    }).timeout(4000);
  });
});

