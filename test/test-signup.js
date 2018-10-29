const chai = require('chai');
const chaiHttp = require('chai-http');
const server = require('../dist/app');
const should = chai.should();

const email = 'justinfrancos@gmail.com';
const password = 'ifthisislongenoughdictionarywordsarefine';
const token = 'tok_visa';

chai.use(chaiHttp);

tests = [

['with weak password',                            { password: 'mypassword3', stripe_token: token, email: email }],
['with missing password',                         { email: email, stripe_token: token }],
['with missing token',                            { password: password, email: email}],
['with bad token',                                { password: password, email: email, stripe_token: 'asdf'}],
['with missing email',                            { password: password, stripe_token: token}],
['with bad email',                                { password: password, stripe_token: token, email: 'asdf'}],
['with blank email',                              { email: '', password: password, stripe_token: token}],
['with blank token',                              { email: email, password: password, stripe_token: ''}],
['with blank password',                           { email: email, password: '', stripe_token: token}],
['with card fails after successful attachment',   { email: email, password: password, stripe_token: 'tok_chargeCustomerFail' }]

]

describe('signup', () => {
  tests.forEach((test) => {
    describe(test[0], function() {
      it('should return an error', (done) => {
        chai.request(server)
        .post('/signup')
        .send(test[1])
        .end(function(err, res) {
          res.body.should.include.key('error');
          res.should.have.status(200);
          done();
        });
      }).timeout(4000);
    });
  });

  describe('with valid parameters', () => {
    it('should return 200 and no error', (done) => {
      chai.request(server)
      .post('/signup')
      .send({email: email, password: password, stripe_token: token})
      .end(function(err, res) {
        res.body.should.not.include.key('error');
        res.should.have.status(200);
        done();
      });
    }).timeout(4000);
  });
});

