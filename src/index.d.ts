import express from "express";
import { customers } from "stripe";

declare module "express" {
	export interface Request {
		user?: { [key: string]: any };
		value?: { [key: string]: any };
		subscription: { [key: string]: any };
		customer: customers.ICustomer;
	}
}
