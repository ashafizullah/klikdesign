import { nanoid } from "nanoid";

export const newId = (prefix: string) => `${prefix}_${nanoid(8)}`;
