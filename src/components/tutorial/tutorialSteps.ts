export interface TutorialStep {
  id: string;
  target: string | null; // data-tutorial attribute value, or null for centered modal
  title: string;
  description: string;
  preferredSide: 'top' | 'bottom' | 'left' | 'right' | null;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    target: null,
    title: 'Welcome to the UK Election Explorer',
    description:
      'This interactive tool lets you explore every UK General Election from 1955 to 2024. All the views are linked — hovering or clicking in one updates the others. Let\'s take a quick tour of the key features.',
    preferredSide: null,
  },
  {
    id: 'year-nav',
    target: 'year-navigation',
    title: 'Year Navigation',
    description:
      'Use the arrow buttons to step through elections, or click on a year in the national charts below. The entire page updates to show that election\'s results.',
    preferredSide: 'bottom',
  },
  {
    id: 'election-info',
    target: 'election-info-bar',
    title: 'Election Context',
    description:
      'A brief summary of each election pulled from Wikipedia, including turnout, seat counts, and key events.',
    preferredSide: 'bottom',
  },
  {
    id: 'national-charts',
    target: 'national-charts',
    title: 'National Trends',
    description:
      'Seat counts and vote share over time. The line charts show every election; the bar charts show the current year. Hover over any year in the line chart to preview its data across all views.',
    preferredSide: 'right',
  },
  {
    id: 'ternary-plot',
    target: 'ternary-plot',
    title: 'Ternary Plot',
    description:
      'Each dot is a constituency, positioned by its Conservative, Labour, and Liberal Democrat vote shares. Click a dot to select that constituency; hover to preview.',
    preferredSide: 'right',
  },
  {
    id: 'geographic-map',
    target: 'geographic-map',
    title: 'Geographic Map',
    description:
      'The geographic view of constituencies. Scroll to zoom, drag to pan. Click a constituency to see its details in the panel below.',
    preferredSide: 'left',
  },
  {
    id: 'map-controls',
    target: 'map-controls',
    title: 'Map Controls',
    description:
      'Switch between a choropleth map, hex cartogram, or dot density view. You can also colour by party vote share or Con/Lab swing instead of the winner.',
    preferredSide: 'right',
  },
  {
    id: 'constituency-panel',
    target: 'constituency-panel',
    title: 'Constituency Detail',
    description:
      'When you select a constituency, its full results and historical vote share chart appear here. Hover over the chart to see results from any past election.',
    preferredSide: 'top',
  },
  {
    id: 'comparison-mode',
    target: 'pin-button',
    title: 'Comparison Mode',
    description:
      'Pin the current year, then navigate to another election to compare them side by side — maps, ternary plots, and info bars all split into two panels.',
    preferredSide: 'bottom',
  },
  {
    id: 'done',
    target: null,
    title: "You're All Set!",
    description:
      'That covers the basics. You can always revisit this tour from the (i) About panel in the top-left corner. Enjoy exploring!',
    preferredSide: null,
  },
];
