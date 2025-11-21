import { describe, it, expect } from 'vitest';
import { createMirrorUrlsWithConfig } from './mirrors';
import { UrlEntry } from '../types/download-input-types';

describe('mirrors', () => {
  describe('createMirrorUrlsWithConfig', () => {
    const mockMirrorData = [
      {
        url: 'http://www.main.com',
        mirrors: [
          {
            url: 'http://region1.main.com',
            maxTimestamp: '20000101000000',
          },
          {
            url: 'http://region2.main.com',
            minTimestamp: '19980601000000',
          },
        ],
      },
      {
        url: 'http://www.microsoft.com',
        mirrors: [
          {
            url: 'http://region1.microsoft.com',
            maxTimestamp: '20000101000000',
          },
          {
            url: 'http://region2.microsoft.com',
            minTimestamp: '19980601000000',
          },
        ],
      },
      {
        url: 'http://www.example.com',
        mirrors: [
          {
            url: 'http://www.example4.com',
          },
        ],
      },
    ];

    it('should add original URL first', () => {
      const urls: UrlEntry[] = [
        { url: 'http://example.com/test.html' },
      ];

      const result = createMirrorUrlsWithConfig(urls, [], mockMirrorData);

      expect(result[0]).toEqual({
        url: 'http://example.com/test.html',
        maxTimestamp: undefined,
        minTimestamp: undefined,
      });
    });

    it('should include original per-URL timestamps in result', () => {
      const urls: UrlEntry[] = [
        {
          url: 'http://example.com/test.html',
          maxTimestamp: '20050101000000',
          minTimestamp: '20030101000000',
        },
      ];

      const result = createMirrorUrlsWithConfig(
        urls,
        [],
        mockMirrorData
      );

      expect(result[0]).toEqual({
        url: 'http://example.com/test.html',
        maxTimestamp: '20050101000000',
        minTimestamp: '20030101000000',
      });
    });

    it('should add mirrors from mirror data with only path', () => {
      const urls: UrlEntry[] = [
        { url: 'http://www.example.com/test.html' },
      ];

      const result = createMirrorUrlsWithConfig(urls, [], mockMirrorData);

      expect(result.length).toBe(2); // original + 1 mirror
      expect(result[1]).toEqual({
        url: 'http://www.example4.com/test.html',
        mirrorUrl: true,
        maxTimestamp: undefined,
        minTimestamp: undefined,
      });
    });

    it('should clamp timestamps when mirror has maxTimestamp', () => {
      const urls: UrlEntry[] = [
        {
          url: 'http://www.microsoft.com/games/age2/default.htm',
          maxTimestamp: '20050101000000', // URL wants up to 2005
        },
      ];

      const result = createMirrorUrlsWithConfig(urls, [], mockMirrorData);

      // First mirror has maxTimestamp of 20000101000000, should clamp to that
      expect(result[1].maxTimestamp).toBe('20000101000000');
    });

    it('should clamp timestamps when mirror has minTimestamp', () => {
      const urls: UrlEntry[] = [
        {
          url: 'http://www.microsoft.com/games/age2/default.htm',
          minTimestamp: '19970101000000', // URL wants from 1997
        },
      ];

      const result = createMirrorUrlsWithConfig(urls, [], mockMirrorData);

      // Second mirror has minTimestamp of 19980601000000, should clamp to that
      expect(result[2].minTimestamp).toBe('19980601000000');
    });

    it('should normalize URLs by removing protocol and www', () => {
      const urls: UrlEntry[] = [
        { url: 'http://www.example.com/test.html' },
        { url: 'https://www.example.com/test.html' },
        { url: 'http://example.com/test.html' },
      ];

      const result = createMirrorUrlsWithConfig(urls, [], mockMirrorData);

      // All three should match the same mirror and use the path only
      expect(result[1].url).toBe('http://www.example4.com/test.html');
      expect(result[3].url).toBe('http://www.example4.com/test.html');
      expect(result[5].url).toBe('http://www.example4.com/test.html');
    });

    it('should add additional mirrors from site config with path only', () => {
      const urls: UrlEntry[] = [
        { url: 'http://example.com/page.html' },
      ];

      const additionalMirrors = [
        'http://custom-example.org',
        'http://another-mirror.org',
      ];

      const result = createMirrorUrlsWithConfig(
        urls,
        additionalMirrors,
        mockMirrorData
      );

      expect(result.length).toBe(4); // original + 1 from mirrorData + 2 additional
      expect(result[2].url).toBe('http://custom-example.org/page.html');
      expect(result[3].url).toBe('http://another-mirror.org/page.html');
    });

    it('should handle paths correctly for root-level files', () => {
      const urls: UrlEntry[] = [
        { url: 'http://example.com/robots.txt' },
      ];

      const result = createMirrorUrlsWithConfig(urls, [], mockMirrorData);

      // Should preserve the root path
      expect(result[1].url).toBe('http://www.example4.com/robots.txt');
    });

    it('should handle paths correctly for nested directories', () => {
      const urls: UrlEntry[] = [
        { url: 'http://microsoft.com/games/age2/default.htm' },
      ];

      const result = createMirrorUrlsWithConfig(urls, [], mockMirrorData);

      // Should only include the path part (/games/age2/default.htm)
      expect(result[1].url).toBe('http://region1.microsoft.com/games/age2/default.htm');
      expect(result[2].url).toBe('http://region2.microsoft.com/games/age2/default.htm');
    });

    it('should handle URLs with no matching mirrors', () => {
      const urls: UrlEntry[] = [
        { url: 'http://unknown-site.com/page.html' },
      ];

      const result = createMirrorUrlsWithConfig(urls, [], mockMirrorData);

      expect(result.length).toBe(1); // only the original URL
      expect(result[0].url).toBe('http://unknown-site.com/page.html');
    });

    it('should handle empty input', () => {
      const result = createMirrorUrlsWithConfig([], [], mockMirrorData);

      expect(result).toEqual([]);
    });

    it('should handle multiple URLs', () => {
      const urls: UrlEntry[] = [
        { url: 'http://example.com/test.html' },
        { url: 'http://microsoft.com/games/age2/default.htm' },
      ];

      const result = createMirrorUrlsWithConfig(urls, [], mockMirrorData);

      expect(result.length).toBe(5); // 2 originals + 1 mirror for first + 2 mirrors for second
    });

    it('should apply additional mirrors timestamps correctly', () => {
      const urls: UrlEntry[] = [
        {
          url: 'http://example.com/page.html',
          maxTimestamp: '20050101000000',
          minTimestamp: '20030101000000',
        },
      ];

      const additionalMirrors = ['http://custom-archive.org'];

      const result = createMirrorUrlsWithConfig(
        urls,
        additionalMirrors,
        mockMirrorData
      );

      // Additional mirrors should use per-URL timestamps
      expect(result[2].maxTimestamp).toBe('20050101000000');
      expect(result[2].minTimestamp).toBe('20030101000000');
    });

    it('should preserve query parameters when adding mirrors', () => {
      const urls: UrlEntry[] = [
        { url: 'http://www.example.com/page.html?id=123&sort=desc' },
      ];

      const result = createMirrorUrlsWithConfig(urls, [], mockMirrorData);

      expect(result.length).toBe(2); // original + 1 mirror
      expect(result[0].url).toBe('http://www.example.com/page.html?id=123&sort=desc');
      expect(result[1].url).toBe('http://www.example4.com/page.html?id=123&sort=desc');
    });

    it('should preserve hash fragments when adding mirrors', () => {
      const urls: UrlEntry[] = [
        { url: 'http://www.example.com/page.html#section2' },
      ];

      const result = createMirrorUrlsWithConfig(urls, [], mockMirrorData);

      expect(result.length).toBe(2); // original + 1 mirror
      expect(result[0].url).toBe('http://www.example.com/page.html#section2');
      expect(result[1].url).toBe('http://www.example4.com/page.html#section2');
    });

    it('should preserve both query parameters and hash fragments when adding mirrors', () => {
      const urls: UrlEntry[] = [
        { url: 'http://www.microsoft.com/games/age2/default.htm?lang=en&version=1#downloads' },
      ];

      const result = createMirrorUrlsWithConfig(urls, [], mockMirrorData);

      expect(result.length).toBe(3); // original + 2 mirrors
      expect(result[0].url).toBe('http://www.microsoft.com/games/age2/default.htm?lang=en&version=1#downloads');
      expect(result[1].url).toBe('http://region1.microsoft.com/games/age2/default.htm?lang=en&version=1#downloads');
      expect(result[2].url).toBe('http://region2.microsoft.com/games/age2/default.htm?lang=en&version=1#downloads');
    });

    it('should preserve query parameters in additional mirrors', () => {
      const urls: UrlEntry[] = [
        { url: 'http://example.com/page.html?param=value' },
      ];

      const additionalMirrors = [
        'http://custom-example.org',
        'http://another-mirror.org',
      ];

      const result = createMirrorUrlsWithConfig(
        urls,
        additionalMirrors,
        mockMirrorData
      );

      expect(result.length).toBe(4); // original + 1 from mirrorData + 2 additional
      expect(result[0].url).toBe('http://example.com/page.html?param=value');
      expect(result[2].url).toBe('http://custom-example.org/page.html?param=value');
      expect(result[3].url).toBe('http://another-mirror.org/page.html?param=value');
    });

    it('should preserve hash fragments in additional mirrors', () => {
      const urls: UrlEntry[] = [
        { url: 'http://example.com/page.html#anchor' },
      ];

      const additionalMirrors = ['http://custom-archive.org'];

      const result = createMirrorUrlsWithConfig(
        urls,
        additionalMirrors,
        mockMirrorData
      );

      expect(result[0].url).toBe('http://example.com/page.html#anchor');
      expect(result[2].url).toBe('http://custom-archive.org/page.html#anchor');
    });
  });
});
