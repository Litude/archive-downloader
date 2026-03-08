import { describe, it, expect } from 'vitest';
import { TrackingImageNormalizer } from './tracking-img-transformation';

function createTestHtml(trackingUrl: string) {
    return 'function footerjs(doc) {}\n' +
        `<layer visibility="hide"><div style="display:none"><img src="${trackingUrl}"></div></layer>`;
}

function createTestHtmlWithSecondaryUrl(trackingUrl: string, secondaryUrl: string) {
    return `function footerjs(doc) {}
        <layer visibility="hide"><div style="display:none"><img src="${trackingUrl}"></div></layer>
        <layer visibility="hide"><div style="display:none"><img alt="" width="0" height="0" border="0" hspace="0" vspace="0" src="${secondaryUrl}"></div></layer>
    `;
}

describe('normalizeTrackingImageUrl', () => {
    it('returns content unchanged when no tracking image is present', () => {
        const html = '<html><body><p>No tracking here</p></body></html>';
        const input = Buffer.from(html, 'latin1');
        const result = TrackingImageNormalizer.normalize(input, {}, {});
        expect(result).toBe(input);
    });

    it('lowercases path in tracking image URL', () => {
        const trackingUrl =
            "http://c.microsoft.com/trans_pixel.asp?source=www&TYPE=' + tt + '&p=France_jeux_empires";
        const html = createTestHtml(trackingUrl);
        const input = Buffer.from(html, 'latin1');
        const result = TrackingImageNormalizer.normalize(input, {}, {});
        const resultHtml = result.toString('latin1');

        expect(resultHtml).toContain('source=www');
        expect(resultHtml).toContain('p=france_jeux_empires');
    });
    
    it('normalizes source in tracking image URL', () => {
        const trackingUrl =
            "http://c.microsoft.com/trans_pixel.asp?source=www.eu&TYPE=' + tt + '&p=france_jeux_empires";
        const html = createTestHtml(trackingUrl);
        const input = Buffer.from(html, 'latin1');
        const result = TrackingImageNormalizer.normalize(input, {}, {});
        const resultHtml = result.toString('latin1');

        expect(resultHtml).toContain('source=www');
    });
    
    it('normalizes source and path in tracking image URL', () => {
        const trackingUrl =
            "http://c.microsoft.com/trans_pixel.asp?source=www.eu&TYPE=' + tt + '&p=France_jeux_empires";
        const html = createTestHtml(trackingUrl);
        const input = Buffer.from(html, 'latin1');
        const result = TrackingImageNormalizer.normalize(input, {}, {});
        const resultHtml = result.toString('latin1');

        expect(resultHtml).toContain('source=www');
        expect(resultHtml).toContain('p=france_jeux_empires');
    });
    
    it('removes top level referrer in tracking image URL', () => {
        const trackingUrl =
            "http://c.microsoft.com/trans_pixel.asp?source=www&TYPE=' + tt + '&p=france_jeux_empires&r=http%3a%2f%2fwww.microsoft.com%2ffrance%2fjeux%2fage2%2fdefault.asp";
        const html = createTestHtml(trackingUrl);
        const input = Buffer.from(html, 'latin1');
        const result = TrackingImageNormalizer.normalize(input, {}, {});
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
        const result = TrackingImageNormalizer.normalize(input, {}, {});
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
        const result = TrackingImageNormalizer.normalize(input, {}, {});
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
        const result = TrackingImageNormalizer.normalize(input, {}, {});
        const resultHtml = result.toString('latin1');

        expect(resultHtml).toContain('source=www');
        expect(resultHtml).toContain('p=brasil_games_age2');
        expect(resultHtml).toContain('&URI=%2fbrasil%2fgames%2fage2%2fcaracteristicas.aspx&GUID=1F4FC18C-F71E-47FB-8FC9-612F8EE59C61&lc=pt-br');
    });

    it('lowercases url path in tracking image as well', () => {
        const trackingUrl =
            "http://c.microsoft.com/trans_pixel.asp?source=www&TYPE=' + tt + '&p=BRASIL_GAMES_AGE2&URI=%2fBRASIL%2fGAMES%2fAGE2%2fdefault.aspx&GUID=1F4FC18C-F71E-47FB-8FC9-612F8EE59C61&lc=pt-br";
        const html = createTestHtml(trackingUrl);
        const input = Buffer.from(html, 'latin1');
        const result = TrackingImageNormalizer.normalize(input, {}, {});
        const resultHtml = result.toString('latin1');

        expect(resultHtml).toContain('source=www');
        expect(resultHtml).toContain('p=brasil_games_age2');
        expect(resultHtml).toContain('&URI=%2fbrasil%2fgames%2fage2%2fdefault.aspx&GUID=1F4FC18C-F71E-47FB-8FC9-612F8EE59C61&lc=pt-br');
    })

    it('normalises url with html encoded ampersands', () => {
        const trackingUrl1 =
          "http://c.microsoft.com/trans_pixel.asp?source=www&TYPE=' + tt + '&p=BRASIL_GAMES_AGE2&URI=%2fBRASIL%2fGAMES%2fAGE2%2fdefault.aspx&GUID=1F4FC18C-F71E-47FB-8FC9-612F8EE59C61&lc=pt-br";
        const trackingUrl2 =
          "http://c.microsoft.com/trans_pixel.asp?source=www&amp;TYPE=PV&amp;p=BRASIL_GAMES_AGE2&amp;URI=%2fBRASIL%2fGAMES%2fAGE2%2fdefault.aspx&amp;GUID=1F4FC18C-F71E-47FB-8FC9-612F8EE59C61&amp;lc=pt-br";
        const html = createTestHtmlWithSecondaryUrl(trackingUrl1, trackingUrl2);
        const input = Buffer.from(html, 'latin1');
        const result = TrackingImageNormalizer.normalize(input, {}, {});
        const resultHtml = result.toString('latin1');

        expect(resultHtml).toContain('source=www');
        expect(resultHtml).toContain('p=brasil_games_age2');
        expect(resultHtml).toContain('&URI=%2fbrasil%2fgames%2fage2%2fdefault.aspx&GUID=1F4FC18C-F71E-47FB-8FC9-612F8EE59C61&lc=pt-br');
        expect(resultHtml).toContain('source=www&amp;TYPE=PV&amp;p=brasil_games_age2&amp;URI=%2fbrasil%2fgames%2fage2%2fdefault.aspx&amp;GUID=1F4FC18C-F71E-47FB-8FC9-612F8EE59C61&amp;lc=pt-br');
    })
    
    it('normalises url with html encoded ampersands', () => {
        const trackingUrl1 =
          "http://c.microsoft.com/trans_pixel.asp?source=www&TYPE=' + tt + '&p=games_Conquerors&URI=%2fgames%2fconquerors%2fcampaigns.aspx%3ff1%3dno&GUID=1F4FC18C-F71E-47FB-8FC9-612F8EE59C61&lc=en-us";
        const trackingUrl2 =
          "http://c.microsoft.com/trans_pixel.asp?source=www&amp;TYPE=PV&amp;p=games_Conquerors&amp;URI=%2fgames%2fconquerors%2fcampaigns.aspx%3ff1%3dno&amp;GUID=1F4FC18C-F71E-47FB-8FC9-612F8EE59C61&amp;lc=en-us";
        const html = createTestHtmlWithSecondaryUrl(trackingUrl1, trackingUrl2);
        const input = Buffer.from(html, 'latin1');
        const result = TrackingImageNormalizer.normalize(input, {}, {
            queryParameters: "strip"
        });
        const resultHtml = result.toString('latin1');

        expect(resultHtml).toContain('source=www');
        expect(resultHtml).toContain('p=games_conquerors');
        expect(resultHtml).toContain('&URI=%2fgames%2fconquerors%2fcampaigns.aspx&GUID=1F4FC18C-F71E-47FB-8FC9-612F8EE59C61&lc=en-us');
        expect(resultHtml).toContain('source=www&amp;TYPE=PV&amp;p=games_conquerors&amp;URI=%2fgames%2fconquerors%2fcampaigns.aspx&amp;GUID=1F4FC18C-F71E-47FB-8FC9-612F8EE59C61&amp;lc=en-us');
    })
    
    
    it('normalises url and adds query parameters from transformation', () => {
        const trackingUrl1 =
          "http://c.microsoft.com/trans_pixel.asp?source=www&TYPE=' + tt + '&p=Games_conquerors&URI=%2fGames%2fconquerors%2fcivilizations.aspx%3ff1%3d%26f2%3dspanish&GUID=1F4FC18C-F71E-47FB-8FC9-612F8EE59C61&lc=en-us";
        const trackingUrl2 =
          "http://c.microsoft.com/trans_pixel.asp?source=www&amp;TYPE=PV&amp;p=Games_conquerors&amp;URI=%2fGames%2fconquerors%2fcivilizations.aspx%3ff1%3d%26f2%3dspanish&amp;GUID=1F4FC18C-F71E-47FB-8FC9-612F8EE59C61&amp;lc=en-us";
        const html = createTestHtmlWithSecondaryUrl(trackingUrl1, trackingUrl2);
        const input = Buffer.from(html, 'latin1');
        const result = TrackingImageNormalizer.normalize(input,
            {
                f1: "yes",
                f2: "spanish"
            },
            {
                queryParameters: "from-transformation",
            }
        );
        const resultHtml = result.toString('latin1');

        expect(resultHtml).toContain('source=www');
        expect(resultHtml).toContain('p=games_conquerors');
        expect(resultHtml).toContain('&URI=%2fgames%2fconquerors%2fcivilizations.aspx%3ff1%3dyes%26f2%3dspanish&GUID=1F4FC18C-F71E-47FB-8FC9-612F8EE59C61&lc=en-us');
        expect(resultHtml).toContain('source=www&amp;TYPE=PV&amp;p=games_conquerors&amp;URI=%2fgames%2fconquerors%2fcivilizations.aspx%3ff1%3dyes%26f2%3dspanish&amp;GUID=1F4FC18C-F71E-47FB-8FC9-612F8EE59C61&amp;lc=en-us');
    })
});
