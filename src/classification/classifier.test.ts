import { describe, expect, it } from 'vitest';
import { classifyEntryWithConfig, ClassifierConfig } from './classifier';

describe('Classifier', () => {
  const testConfig: ClassifierConfig = {
    notFoundStrings: ['page not found', 'error 404'],
    notFoundSha256: ['abc123'],
    transientRedirectSha256: ['def456']
  };

  it('should classify transient redirect by sha256', () => {
    const result = classifyEntryWithConfig(
      'http://example.com',
      'def456',
      'text/html',
      Buffer.from('content'),
      undefined,
      "200",
      testConfig
    );
    expect(result).toBe('transient_retry');
  });

  it('should classify not found page by content', () => {
    const result = classifyEntryWithConfig(
      'http://example.com',
      'xyz',
      'text/html',
      Buffer.from('<html>page not found</html>'),
      undefined,
      "200",
      testConfig
    );
    expect(result).toBe('not_found');
  });

  it('should classify page not matching any criteria as ok', () => {
    const result = classifyEntryWithConfig(
      'http://example.com',
      'xyz',
      'text/html',
      Buffer.from('<html>Hello World!</html>'),
      undefined,
      "200",
      testConfig
    );
    expect(result).toBe('ok');
  });
});
