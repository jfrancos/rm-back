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

const confirmEmailSchema = joi.object().keys({ // let's go back to calling this confirm-email
    email: joi.string().required(),
    key: joi.string().required()
});

const loginSchema = joi.object().keys({
    email: joi.string().required(),
    password: joi.string().required()
});

const updatePasswordSchema = joi.object().keys({ // should invalidate all sessions for user
    accessToken: joi.string(),
    email: joi.string(),
    newPassword: joi.string().required(),
    oldPassword: joi.string(),
}).without("oldPassword", ["accessToken", "email"])
    .and("accessToken", "email")
    .xor("oldPassword", "accessToken");

const resetPasswordSchema = joi.object().keys({
    email: joi.string().email().required()
})

const setShapeSchema = joi.object().keys({
    name: joi.string(),
    shape: joi.object().keys({
        frameColor: joi.string(),
        shapes: joi.array().items(joi.object().keys({
            color: joi.string(),
            cycle: joi.number(),
            subdivisions: joi.array().items(joi.number())
        }))
    })
})

const unsetShapeSchema = joi.object().keys({
    name: joi.string()
})

const emptySchema = joi.object().keys({});

const schemas: { [key: string]: plainJoi.Schema } = {
    confirmEmailSchema,
    emptySchema,
    loginSchema,
    resetPasswordSchema,
    setShapeSchema,
    signupSchema,
    unsetShapeSchema,
    updatePasswordSchema,
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
