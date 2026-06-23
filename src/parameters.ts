/**
 * Helper functions for working with Tableau parameters.
 */

declare const tableau: any;

/**
 * Retrieve a parameter by name from the current dashboard.
 * Returns null if not found.
 */
export async function getParameterByName(name: string): Promise<any | null> {
  const parameters = await tableau.extensions.dashboardContent.dashboard.getParametersAsync();
  return parameters.find((p: any) => p.name === name) || null;
}

/**
 * Get all parameters in the workbook (for populating config dropdowns).
 */
export async function getAllParameters(): Promise<any[]> {
  return tableau.extensions.dashboardContent.dashboard.getParametersAsync();
}

/**
 * Write a WKT POINT value to the spatial parameter.
 */
export async function writeSpatialValue(parameter: any, wkt: string): Promise<void> {
  await parameter.changeValueAsync(wkt);
}
