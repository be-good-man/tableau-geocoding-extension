import { GoogleProvider } from '../../src/providers/google';

// Mock fetch globally
global.fetch = jest.fn();

describe('GoogleProvider', () => {
  const provider = new GoogleProvider();

  beforeEach(() => {
    (fetch as jest.Mock).mockReset();
  });

  it('should have correct metadata', () => {
    expect(provider.id).toBe('google');
    expect(provider.label).toBe('Google Geocoding');
    expect(provider.requiresApiKey).toBe(true);
  });

  it('should parse a successful response', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        status: 'OK',
        results: [{
          geometry: { location: { lat: 37.7749, lng: -122.4194 } },
          formatted_address: '1 Market St, San Francisco, CA 94105, USA',
        }],
      }),
    });

    const result = await provider.geocode('1 Market St, SF', 'test-key');

    expect(result.latitude).toBeCloseTo(37.7749);
    expect(result.longitude).toBeCloseTo(-122.4194);
    expect(result.displayName).toBe('1 Market St, San Francisco, CA 94105, USA');
  });

  it('should throw on ZERO_RESULTS', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({ status: 'ZERO_RESULTS', results: [] }),
    });

    await expect(provider.geocode('xyzabc123', 'test-key'))
      .rejects.toThrow('Google geocoding failed: ZERO_RESULTS');
  });

  it('should throw on invalid API key', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({ status: 'REQUEST_DENIED', results: [] }),
    });

    await expect(provider.geocode('test', 'bad-key'))
      .rejects.toThrow('Google geocoding failed: REQUEST_DENIED');
  });
});
