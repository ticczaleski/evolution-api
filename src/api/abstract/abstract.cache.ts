export interface ICache {
  get(key: string): Promise<any>;

  hGet(key: string, field: string): Promise<any>;

  set(key: string, value: any, ttl?: number): void;

  /**
   * Atomically sets `key` only if it does not already exist.
   * Returns true when this call claimed the key, false when another caller already holds it.
   */
  setNX(key: string, value: any, ttl?: number): Promise<boolean>;

  hSet(key: string, field: string, value: any): Promise<void>;

  has(key: string): Promise<boolean>;

  keys(appendCriteria?: string): Promise<string[]>;

  delete(key: string | string[]): Promise<number>;

  hDelete(key: string, field: string): Promise<any>;

  deleteAll(appendCriteria?: string): Promise<number>;
}
