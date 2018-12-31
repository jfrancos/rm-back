import changeCase from "change-case";
import { NextFunction, Request, Response } from "express";
import plainJoi from "joi";
import joiZxcvbn from "joi-zxcvbn";
import app from "./app";

const joi = plainJoi.extend(joiZxcvbn());

const updateSourceSchema = joi.object().keys({
    source: joi.string().required()
});

const signupSchema = joi.object().keys({
    email: joi
        .string()
        .email()
        .required(),
    password: joi
        .string()
        .zxcvbn(3)
        .required(),
    source: joi.string().required()
});

const keyLoginSchema = joi.object().keys({
    email: joi.string().required(),
    key: joi.string().required()
});

const loginSchema = joi.object().keys({
    email: joi.string().required(),
    password: joi.string().required()
});

const emptySchema = joi.object().keys({});

const schemas: { [key: string]: plainJoi.Schema } = {
    emptySchema,
    keyLoginSchema,
    loginSchema,
    signupSchema,
    updateSourceSchema,
};

const validate = async (req: Request, res: Response, next: NextFunction) => {
    const split = req.url.lastIndexOf("/");
    const schemaString = changeCase.camelCase(req.url.slice(split)) + "Schema";
    // If schema doesn't exist, body should be empty:
    const schema = schemas[schemaString] || schemas.emptySchema;
    const validation = schema.validate(req.body);
    if (validation.error) {
        app.handleError(
            req,
            res,
            validation.error.name,
            validation.error.message
        );
        return;
    }
    req.value = validation.value;
    next();
};

export default validate;
