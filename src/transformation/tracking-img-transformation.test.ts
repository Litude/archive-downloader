import { describe, it, expect } from 'vitest';
import { TrackingImageNormalizer } from './tracking-img-transformation';

function createTestHtml(trackingUrl: string) {
    return 'function footerjs(doc) {}\n' +
        `<layer visibility="hide"><div style="display:none"><img src="${trackingUrl}"></div></layer>`;
}

describe('normalizeTrackingImageUrl', () => {
    it('returns content unchanged when no tracking image is present', () => {
        const html = '<html><body><p>No tracking here</p></body></html>';
        const input = Buffer.from(html, 'latin1');
        const result = TrackingImageNormalizer.normalize(input, {});
        expect(result).toBe(input);
    });

    it('lowercases path in tracking image URL', () => {
        const trackingUrl =
            "http://c.microsoft.com/trans_pixel.asp?source=www&TYPE=' + tt + '&p=France_jeux_empires";
        const html = createTestHtml(trackingUrl);
        const input = Buffer.from(html, 'latin1');
        const result = TrackingImageNormalizer.normalize(input, {});
        const resultHtml = result.toString('latin1');

        expect(resultHtml).toContain('source=www');
        expect(resultHtml).toContain('p=france_jeux_empires');
    });
    
    it('normalizes source in tracking image URL', () => {
        const trackingUrl =
            "http://c.microsoft.com/trans_pixel.asp?source=www.eu&TYPE=' + tt + '&p=france_jeux_empires";
        const html = createTestHtml(trackingUrl);
        const input = Buffer.from(html, 'latin1');
        const result = TrackingImageNormalizer.normalize(input, {});
        const resultHtml = result.toString('latin1');

        expect(resultHtml).toContain('source=www');
    });
    
    it('normalizes source and path in tracking image URL', () => {
        const trackingUrl =
            "http://c.microsoft.com/trans_pixel.asp?source=www.eu&TYPE=' + tt + '&p=France_jeux_empires";
        const html = createTestHtml(trackingUrl);
        const input = Buffer.from(html, 'latin1');
        const result = TrackingImageNormalizer.normalize(input, {});
        const resultHtml = result.toString('latin1');

        expect(resultHtml).toContain('source=www');
        expect(resultHtml).toContain('p=france_jeux_empires');
    });
    
    it('removes top level referrer in tracking image URL', () => {
        const trackingUrl =
            "http://c.microsoft.com/trans_pixel.asp?source=www&TYPE=' + tt + '&p=france_jeux_empires&r=http%3a%2f%2fwww.microsoft.com%2ffrance%2fjeux%2fage2%2fdefault.asp";
        const html = createTestHtml(trackingUrl);
        const input = Buffer.from(html, 'latin1');
        const result = TrackingImageNormalizer.normalize(input, {});
        const resultHtml = result.toString('latin1');

        expect(resultHtml).toContain('source=www');
        expect(resultHtml).toContain('p=france_jeux_empires');
        expect(resultHtml).not.toContain('r=');
    });

    it('normalizes URL level host in tracking image URL', () => {
        const trackingUrl =
            "http://c.microsoft.com/trans_pixel.asp?source=www.eu&TYPE=' + tt + '&p=France_jeux_empires&URI=%2flibrary%2ftoolbar%2f3.0%2fasp.aspx%3fmode%3dhead%26c%3d%2ffrance%2fjeux%2fjeux15.config%26h%3dwww%252Eeu%252Emicrosoft%252Ecom%26u%3d%252Ffrance%252Fjeux%252Fempires%252Fdefault%252Easp%26r%3d&GUID=1F4FC18C-F71E-47FB-8FC9-612F8EE59C61";
        const html = createTestHtml(trackingUrl);
        const input = Buffer.from(html, 'latin1');
        const result = TrackingImageNormalizer.normalize(input, {});
        const resultHtml = result.toString('latin1');

        expect(resultHtml).toContain('source=www');
        expect(resultHtml).toContain('p=france_jeux_empires');
        expect(resultHtml).toContain('&URI=%2flibrary%2ftoolbar%2f3.0%2fasp.aspx%3fmode%3dhead%26c%3d%2ffrance%2fjeux%2fjeux15.config%26h%3dwww%252Emicrosoft%252Ecom%26u%3d%252Ffrance%252Fjeux%252Fempires%252Fdefault%252Easp%26r%3d&GUID');
        expect(resultHtml).not.toContain('r=');
    });

    it('removes URL level referrer in tracking image URL', () => {
        const trackingUrl =
            "http://c.microsoft.com/trans_pixel.asp?source=www&TYPE=' + tt + '&p=france_jeux_empires&URI=%2flibrary%2ftoolbar%2f3.0%2fasp.aspx%3fmode%3dhead%26c%3d%2ffrance%2fjeux%2fjeux15.config%26h%3dwww%252Emicrosoft%252Ecom%26u%3d%252Ffrance%252Fjeux%252Fempires%252Fdefault%252Easp%26r%3dhttp%253A%252F%252Fwww%252Emicrosoft%252Ecom%252Ffrance%252Fjeux%252Fage2%252Fdefault%252Easp&GUID=1F4FC18C-F71E-47FB-8FC9-612F8EE59C61&r=http%3a%2f%2fwww.microsoft.com%2ffrance%2fjeux%2fage2%2fdefault.asp";
        const html = createTestHtml(trackingUrl);
        const input = Buffer.from(html, 'latin1');
        const result = TrackingImageNormalizer.normalize(input, {});
        const resultHtml = result.toString('latin1');

        expect(resultHtml).toContain('source=www');
        expect(resultHtml).toContain('p=france_jeux_empires');
        expect(resultHtml).toContain('&URI=%2flibrary%2ftoolbar%2f3.0%2fasp.aspx%3fmode%3dhead%26c%3d%2ffrance%2fjeux%2fjeux15.config%26h%3dwww%252Emicrosoft%252Ecom%26u%3d%252Ffrance%252Fjeux%252Fempires%252Fdefault%252Easp%26r%3d&GUID');
        expect(resultHtml).not.toContain('r=');
    });

    it('does not modify tracking image URL when options URI has no subparts', () => {
        const trackingUrl =
            "http://c.microsoft.com/trans_pixel.asp?source=www&TYPE=' + tt + '&p=brasil_games_age2&URI=%2fbrasil%2fgames%2fage2%2fcaracteristicas.aspx&GUID=1F4FC18C-F71E-47FB-8FC9-612F8EE59C61&lc=pt-br";
        const html = createTestHtml(trackingUrl);
        const input = Buffer.from(html, 'latin1');
        const result = TrackingImageNormalizer.normalize(input, {});
        const resultHtml = result.toString('latin1');

        expect(resultHtml).toContain('source=www');
        expect(resultHtml).toContain('p=brasil_games_age2');
        expect(resultHtml).toContain('&URI=%2fbrasil%2fgames%2fage2%2fcaracteristicas.aspx&GUID=1F4FC18C-F71E-47FB-8FC9-612F8EE59C61&lc=pt-br');
    });
});
