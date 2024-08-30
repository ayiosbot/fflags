/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Ayios. All rights reserved.
 *  All code created by Ayios within this repository is licensed under the MIT License. Other
 *  code not created by Ayios is under their respective license, which should have an
 *  indication of whatever copyright the file is subject to.
 *--------------------------------------------------------------------------------------------*/

import { MongoClient } from 'mongodb';
import Redis from 'ioredis';
import EventEmitter from 'eventemitter3';

// todo: Implement watch stream implementation!
export enum FFlagEnum {
    REFRESH_CHANGE = 0
}

export interface FFlag {
    _id: string;
    type: 'fast' | 'dynamic';
    value: string | number | boolean | string[];
    createdAt?: Date;
    /** Optional variable. Potentially helpful for developers */
    env?: string | number | string[] | number[];
    tags?: string[] | number[];
    description?: string;
    attributes: any;
}

export interface FFlagList {
    fast: {
        [key: string]: [ FFlag['value'] ]
    },
    dynamic: {
        [key: string]: [ newValue: FFlag['value'], cachedValue: FFlag['value'] ]
    }
}
// todo: publish as a npm module later
// also updtae refreshRate. set base to 30s.

export interface FFlagOptions {
    /** The database to use */
    database: MongoClient;
    /**
     * The database collection to fetch FFlag results for.
     * - MongoDB users (format: database_name/collection)
     *  - example: 'service_name/fflags'
     * For MongoDB, a `find({})` query will be executed.
     */
    collection: string;
    /**
     * A function to determine if extra data should be transmitted to the MongoDB search query. (Object.assign() to a dictionary)
     * 
     * Return false to use the standard filter which will return and cache all FFlags. Return an object to assign the keys/values to the search query (typically mongo)
    */
    filter?: () => any | false;
    /** A custom way to receive events/logs if desired */
    logger?: (enumID: FFlagEnum, action: string, context: any) => any;
    /**
     * Relies on built-in FFlag `DynamicFFlagRefreshRate` (number).
     * This determines IF the refresh rate can be dynamically changed with the aforementioned flag.
     * 
     * This is automatically created if it does not exist.
     */
    doCoreDynamicRefresh?: boolean;
    /**
     * The default refresh rate for dynamic flags in milliseconds.
     * @default 30000
     */
    dynamicRefreshRate?: number
    // flags: FFlagList;
}
export default class FFlagsCollection<
    fastFlags = any,
    dynamicFlags = any,
    DynamicEventTypes extends EventEmitter.ValidEventTypes = {}
> extends EventEmitter <DynamicEventTypes> {
    private cache: Map<`${'fast'|'dynamic'}:${string}`, any> = new Map();
    private database: FFlagOptions['database'];
    private filter!: FFlagOptions['filter'];
    private logger!: FFlagOptions['logger'];
    private collection: string;
    private db_name?: string;
    private isUpdated: boolean = false;
    private refreshRateObtained: boolean = false;
    private refreshRate: number = 30000;
    private interval!: NodeJS.Timeout;
    private intervalFunc!: Function;

    /**
     * 
     * BUILT-IN FFLAG:
     * `refreshRate` - dynamic number. Determines how long the refresh rate is for 
     * @param mongo 
     * @param database 
     * @param collection 
     */
    constructor(options: FFlagOptions) {
        super();
        options = Object.assign({
            // dynamicRefreshRate: false,
            dynamicRefreshRate: 30000,
            doCoreDynamicRefresh: false,
            // filter: () => true
            filter: () => false,
            logger: (_a, _b, _c) => false
        } as FFlagOptions, options);
        this.filter = options.filter;
        this.database = options.database
        if (this.database instanceof MongoClient) {
            const [ dbname, collname ] = options.collection.split('/');
            this.db_name = dbname;
            this.collection = collname;
        } else {
            this.collection = options.collection;
        }
        this.intervalFunc = () => this.updateDynamicCache().catch(() => false);
        this.interval = setInterval(() => {
            if (!this.isUpdated) return;
            this.intervalFunc();
        }, this.refreshRate);

        if (options.dynamicRefreshRate) {
            // @ts-ignore
            this.on('DynamicFFlagRefreshRate', value => {
                if (value !== this.refreshRate) {
                    const cached = this.refreshRate;
                    this.resetInterval(value);
                    this.logger!(FFlagEnum.REFRESH_CHANGE, 'CHANGE REFRESH RATE', { current: value, cached: cached });
                    // Logger.info(`Changed FFlag refresh rate.`);
                }
            });
        }
    }
    private resetInterval(newInterval: number) {
        clearInterval(this.interval);
        this.refreshRate = newInterval;
        this.interval = setInterval(() => this.intervalFunc(), this.refreshRate);
    }
    defineFast<T>(value: fastFlags, fallback?: string | boolean | number | T): T {
        return this.cache.get(`fast:${value}`) ?? fallback;
    }
    defineDynamic<T>(value: dynamicFlags, fallback?: string | boolean | number | T): T {
        return this.cache.get(`dynamic:${value}`) ?? fallback;
    }
    /**
     * Updates fast cache. Resolves immediately if already cached.
     * @returns 
     */
    async updateFastCache(): Promise<void> {
        if (this.isUpdated) return Promise.resolve();
        return new Promise(async (resolve, reject) => {

            const filterResult = this.filter!();
            let query = { type: 'fast' }
            if (filterResult !== false) {
                query = Object.assign(filterResult, { type: 'fast' });
            }
            const cache = await this.database.db(this.db_name).collection(this.collection).find<FFlag>(query).toArray();
            cache.forEach(flag => {
                this.cache.set(`fast:${flag._id}`, flag.value);
            });
            this.isUpdated = true;
            return resolve();
        });
    }
    async updateDynamicCache(): Promise<void> {
        return new Promise(async (resolve, reject) => {
            const filterResult = this.filter!();
            let query = { type: 'dynamic' }
            if (filterResult !== false) {
                query = Object.assign(filterResult, { type: 'dynamic' });
            }
            const cache = await this.database.db(this.db_name).collection(this.collection).find<FFlag>(query).toArray();
            cache.forEach(flag => {
                const oldValue = this.cache.get(`dynamic:${flag._id}` as `dynamic:${string}`) as FFlag['value'];
                this.cache.set(`dynamic:${flag._id}`, flag.value);
                if (oldValue !== undefined) {
                    if (Array.isArray(flag.value)) {
                        // @ts-ignore
                        if (JSON.stringify(flag.value) !== JSON.stringify(oldValue)) this.emit(flag._id as any, flag.value, oldValue);
                    } else {
                        // @ts-ignore
                        if (flag.value !== oldValue) this.emit(flag._id as any, flag.value, oldValue);
                    }
                }
            });
            return resolve();
        });
    }
}