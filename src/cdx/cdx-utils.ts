export function cdxStringToNumber(str: string | undefined): number | undefined {
    if (!str || str === '-') {
        return undefined;
    }
    const num = parseInt(str, 10);
    return isNaN(num) ? undefined : num;
}
