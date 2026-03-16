export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] }

export function isDefined<TValue>(value: TValue | null | undefined): value is TValue {
    return value !== null && value !== undefined;
}
