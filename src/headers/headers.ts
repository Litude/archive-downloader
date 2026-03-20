import { RawHeader } from "../utils/raw-header-parser";

export function getHeaderValue(headers: RawHeader[], headerName: string): string | undefined {
    const header = headers.find(([key]) => key.toLowerCase() === headerName.toLowerCase());
    return header ? header[1] : undefined;
}
