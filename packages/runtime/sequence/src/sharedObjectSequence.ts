import { IComponentRuntime, ISharedObjectServices } from "@prague/runtime-definitions";
import { SharedObjectSequenceExtension } from "./extension";
import { SharedSequence } from "./sharedSequence";

export class SharedObjectSequence<T> extends SharedSequence<T> {
    constructor(
        document: IComponentRuntime,
        public id: string,
        services?: ISharedObjectServices) {
        super(document, id, SharedObjectSequenceExtension.Type, services);
    }

    public getRange(start: number, end?: number) {
        return this.getItems(start, end);
    }
}
