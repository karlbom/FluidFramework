import type { Readable } from "stream";
import { S3, S3ClientConfig } from "@aws-sdk/client-s3";
import { IBackend, EncodingOpts, StatLike } from "./filesystem";

function streamToUint8Array(stream: Readable): Promise<Uint8Array> {
    return new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.once("end", () => resolve(Buffer.concat(chunks)));
        stream.once("error", reject);
    });
}

export class S3PromisifiedFileSystem implements IBackend {
    private readonly client: S3;

    constructor(config: S3ClientConfig, private readonly bucket: string) {
        this.client = new S3(config);
    }
    async readFile(filepath: string, opts: EncodingOpts): Promise<string | Uint8Array> {
        const data = await this.client.getObject({ Bucket: this.bucket, Key: filepath });
        const stream = data.Body as Readable;
        if (stream) {
            const array = await streamToUint8Array(stream);
            return array;
        } else {
            // TODO(marcus): figure out the behaviour of readFile in node fs does it throw?
            // copy throw behaviour of FS
            throw new Error("no stream found");
        }
    }
    async writeFile(filepath: string, data: string | Uint8Array, opts: EncodingOpts): Promise<void> {
        await this.client.putObject({ Bucket: this.bucket, Key: filepath, Body: data });
    }
    async unlink(filepath: string, opts: any): Promise<void> {
        await this.client.deleteObject({ Bucket: this.bucket, Key: filepath });
    }
    async readdir(filepath: string, opts: any): Promise<string[]> {
        const result = await this.client.listObjects({ Bucket: this.bucket, Delimiter: "/", Prefix: filepath });
        // TODO(marcus): pagination
        // TODO(marcus): Key likely needs to be sliced? to not contain the parent directy path?
        if (result.Contents) {
            return result.Contents.map((c) => c.Key);
        } else {
            throw new Error("Not found");
        }

        throw new Error("Method not implemented.");
    }
    async mkdir(filepath: string, opts: any): Promise<void> {
        await this.client.putObject({
            Bucket: this.bucket,
            Key: filepath.endsWith("/") ? filepath : `${filepath}/`,
        });
    }
    async rmdir(filepath: string, opts: any): Promise<void> {
        await this.client.deleteObject({
            Bucket: this.bucket,
            Key: filepath.endsWith("/") ? filepath : `${filepath}/`,
        });
    }
    async stat(filepath: string, opts: any): Promise<StatLike> {
        if (filepath.endsWith("/")) {
            const date = new Date().getTime() / 1000;
            return {
                type: "dir",
                mode: 0,
                size: 0,
                ino: "0",
                mtimeMs: date,
            };
        } else {
            try {
                const result = await this.client.headObject({ Bucket: this.bucket, Key: filepath });
                return {
                    type: "file",
                    mode: 0,
                    size: result.ContentLength,
                    ino: "0",
                    mtimeMs: result.LastModified.getTime() / 1000,
                };
            } catch (error) {
                const typed = error as unknown as any;
                const e = new Error(typed.message) as any;
                e.code = "ENOENT";
                throw e;
            }
        }
    }

    async lstat(filepath: string, opts: any): Promise<StatLike> {
        if (filepath.endsWith("/")) {
            const date = new Date().getTime() / 1000;
            return {
                type: "dir",
                mode: 0,
                size: 0,
                ino: "0",
                mtimeMs: date,
            };
        } else {
            const result = await this.client.headObject({ Bucket: this.bucket, Key: filepath });
            return {
                type: "file",
                mode: 0,
                size: result.ContentLength,
                ino: "0",
                mtimeMs: result.LastModified.getTime() / 1000,
            };
        }
    }
}
