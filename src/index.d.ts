import express from "express";
import Stripe, { ICard, IStripeError } from "stripe";
type Customer = Stripe.customers.ICustomer;

declare module "express" {
	export interface Request {
		user?: { [key: string]: any };
		value?: { [key: string]: any };
		subscription: { [key: string]: any };
		customer: Customer; // { [key: string]: any };
	}
}
