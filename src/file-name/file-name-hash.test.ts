import { describe, it, expect } from 'vitest';
import { determineFilenameFromUrls, getOriginalQueryString, filenameToString } from './file-name';
import { WebsiteFileEntryJson } from '../types/website-types';
import { UrlEntry } from '../types/download-input-types';

describe('Query Hash Parameters', () => {
  it('should transform query parameters in filename based on queryHashParameters', () => {
    const file: WebsiteFileEntryJson = {
      filename: 'screenshot_slideshow.asp',
      queryHashParameters: [
        {
          paramName: 'bottomframe',
          outputName: 'btm',
          pattern: '\\/Games\\/CONQUERORS\\/SCREENSHOTS_(subnav_[sb])\\.htm',
          captureGroups: [1],
          required: false
        },
        {
          paramName: 'topframe',
          outputName: 'top',
          pattern: '\\/Games\\/CONQUERORS\\/(screenshots_[mb])\\.asp\\?image=(\\d+)',
          captureGroups: [1, 2],
          required: false
        }
      ]
    };

    const urls: UrlEntry[] = [];
    const queryParams = {
      bottomframe: '/Games/CONQUERORS/SCREENSHOTS_subnav_s.htm',
      topframe: '/Games/CONQUERORS/screenshots_m.asp?image=15'
    };

    const filename = determineFilenameFromUrls(file, urls, queryParams);
    filename.queryHashParameters = file.queryHashParameters;
    const filenameStr = filenameToString(filename, 'simple');

    // Should use transformed params in the filename
    expect(filenameStr).toContain('btm=subnav_s');
    expect(filenameStr).toContain('top=screenshots_m-15');
    expect(filenameStr).not.toContain('/Games/CONQUERORS');
    
    // Original query params should still be stored in the filename object
    expect(filename.queryParams).toEqual(queryParams);
  });

  it('should handle multiple capture groups', () => {
    const file: WebsiteFileEntryJson = {
      filename: 'test.asp',
      queryHashParameters: [
        {
          paramName: 'top',
          pattern: '\\/Games\\/CONQUERORS\\/(screenshots_[mb])\\.asp\\?image=(\\d+)',
          captureGroups: [1, 2],
          required: false
        }
      ]
    };

    const urls: UrlEntry[] = [];
    const queryParams = {
      top: '/Games/CONQUERORS/screenshots_b.asp?image=12'
    };

    const filename = determineFilenameFromUrls(file, urls, queryParams);
    filename.queryHashParameters = file.queryHashParameters;
    const filenameStr = filenameToString(filename, 'simple');

    expect(filenameStr).toContain('top=screenshots_b-12');
    expect(filename.queryParams).toEqual(queryParams);
  });

  it('should return original params if pattern does not match', () => {
    const file: WebsiteFileEntryJson = {
      filename: 'test.asp',
      queryHashParameters: [
        {
          paramName: 'param',
          pattern: '\\/specific\\/pattern',
          captureGroups: [1],
          required: false
        }
      ]
    };

    const urls: UrlEntry[] = [];
    const queryParams = {
      param: '/does/not/match'
    };

    const filename = determineFilenameFromUrls(file, urls, queryParams);
    filename.queryHashParameters = file.queryHashParameters;
    const filenameStr = filenameToString(filename, 'simple');

    // Should use original params when pattern doesn't match
    expect(filenameStr).toContain('param=~sdoes~snot~smatch');
    expect(filename.queryParams).toEqual(queryParams);
  });

  it('should return original params if required parameter is missing', () => {
    const file: WebsiteFileEntryJson = {
      filename: 'test.asp',
      queryHashParameters: [
        {
          paramName: 'required',
          pattern: '\\/pattern',
          captureGroups: [1],
          required: true
        }
      ]
    };

    const urls: UrlEntry[] = [];
    const queryParams = {
      other: 'value'
    };

    const filename = determineFilenameFromUrls(file, urls, queryParams);
    filename.queryHashParameters = file.queryHashParameters;
    const filenameStr = filenameToString(filename, 'simple');

    // Should use original params when required param is missing
    expect(filenameStr).toContain('other=value');
    expect(filename.queryParams).toEqual(queryParams);
  });

  it('should handle optional parameters gracefully', () => {
    const file: WebsiteFileEntryJson = {
      filename: 'test.asp',
      queryHashParameters: [
        {
          paramName: 'optional',
          pattern: '\\/pattern\\/(\\w+)',
          captureGroups: [1],
          required: false
        },
        {
          paramName: 'existing',
          pattern: '(\\w+)',
          captureGroups: [1],
          required: false
        }
      ]
    };

    const urls: UrlEntry[] = [];
    const queryParams = {
      existing: 'test'
    };

    const filename = determineFilenameFromUrls(file, urls, queryParams);
    filename.queryHashParameters = file.queryHashParameters;
    const filenameStr = filenameToString(filename, 'simple');

    expect(filenameStr).toContain('existing=test');
    expect(filename.queryParams).toEqual(queryParams);
  });

  it('should get original query string', () => {
    const file: WebsiteFileEntryJson = {
      filename: 'test.asp',
      queryHashParameters: [
        {
          paramName: 'param',
          pattern: '(\\w+)',
          captureGroups: [1],
          required: false
        }
      ]
    };

    const urls: UrlEntry[] = [];
    const queryParams = {
      param: 'longvalue',
      other: 'data'
    };

    const filename = determineFilenameFromUrls(file, urls, queryParams);
    filename.queryHashParameters = file.queryHashParameters;
    const originalQueryString = getOriginalQueryString(filename);

    // When queryHashParameters are provided, return the untransformed version
    expect(originalQueryString).toBe('~qother=data&param=longvalue');
  });

  it('should return undefined for original query string when no transformation configured', () => {
    const file: WebsiteFileEntryJson = {
      filename: 'test.asp'
    };

    const urls: UrlEntry[] = [];
    const queryParams = {
      param: 'value'
    };

    const filename = determineFilenameFromUrls(file, urls, queryParams);
    const originalQueryString = getOriginalQueryString(filename);

    expect(originalQueryString).toBeUndefined();
  });
});
