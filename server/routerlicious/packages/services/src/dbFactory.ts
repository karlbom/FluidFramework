import { DbFactoryFactory } from "@fluidframework/server-services-core";
import { Provider } from "nconf";
import { MongoDbFactory } from "./mongodb";
export class RouterlicousDbFactoryFactory extends DbFactoryFactory {
    constructor(config: Provider) {
        const defaultBackend = config.get("db:default") || "MongoDb";
        super(config, [
            { name: "MongoDb", factory: async () => new MongoDbFactory(config.get("mongo")) }],
            defaultBackend);
    }
}
