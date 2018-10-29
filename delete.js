#!/usr/local/bin/node

var stripe = require("stripe")("sk_test_4vUzfLsfzZ7ffojQgISR1ntd");

stripe.customers.list(
  { limit: 100,
  	email: 'justinfrancos@gmail.com' },
  function(err, customers) {
    customers.data.forEach((customer) => stripe.customers.del(customer.id).catch((err) => console.log('Customer deletion error:\n',
			(({ rawType, code, param, message, detail }) => ({ rawType, code, param, message, detail })) (err))));
  }
);