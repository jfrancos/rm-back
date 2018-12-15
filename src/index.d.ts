declare module "joi-zxcvbn" {
    export default function joiZxcvbn(): () => {};
}

declare namespace Express {
    export interface Request {
        user?: { [key: string]: any };
        value?: { [key: string]: any };
    }
}
