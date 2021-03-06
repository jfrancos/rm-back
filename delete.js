#!/usr/local/bin/node

require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_KEY);

delete_customers = async () => {
	const customers = await stripe.customers.list({ limit: 100, email: 'justinfrancos@gmail.com' });
	const data = customers.data;
	if (data.length > 0) {
    	data.forEach( async (customer) => {
    		try {
    			await stripe.customers.del(customer.id);
    		} catch(err) {
				console.log('Customer deletion error:\n',
				(({ rawType, code, param, message, detail }) => ({ rawType, code, param, message, detail })) (err))
			}
		})
		console.log('Deleting more customers in 5 seconds');
		if (data.length === 100) {
			setTimeout( delete_customers, 5000 );
		}
	}
}

delete_customers();