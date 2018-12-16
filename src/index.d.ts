import express from "express";

declare module "express" {
	export interface Request {
		user?: { [key: string]: any };
		value?: { [key: string]: any };
	}
}
