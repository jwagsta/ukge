/** Hand-crafted election summaries. headline is shown truncated in the info bar;
 *  detail expands below on click. */
export interface ElectionSummary {
  headline: string;
  detail: string;
}

export const electionSummaries: Record<number, ElectionSummary> = {
  1955: {
    headline: "Eden's Conservatives increase majority to 60 seats.",
    detail: "Anthony Eden succeeded Churchill as PM earlier that year and called a quick election to secure his own mandate. The Conservatives won 345 seats to Labour's 277 on a turnout of 76.8%. The result confirmed the post-war Conservative recovery begun with their narrow 1951 victory. Clement Attlee fought his last election as Labour leader before being succeeded by Hugh Gaitskell.",
  },
  1959: {
    headline: "Macmillan wins third consecutive Tory term with 100-seat majority.",
    detail: "Harold Macmillan's 'you've never had it so good' message resonated with voters during an economic boom. The Conservatives won 365 seats to Labour's 258, their best result since 1935. The Liberal Party began its slow revival with 6 seats. Hugh Gaitskell's Labour suffered a third successive defeat, triggering internal debates about the party's direction.",
  },
  1964: {
    headline: "Wilson's Labour narrowly ends 13 years of Conservative rule.",
    detail: "Harold Wilson won with a majority of just 4 seats after the Profumo scandal and economic difficulties damaged the Conservatives. Labour took 317 seats to the Conservatives' 304. The slim margin made another election inevitable within two years. Alec Douglas-Home, who had controversially succeeded Macmillan via the 'magic circle', resigned as Tory leader shortly after.",
  },
  1966: {
    headline: "Wilson's snap election delivers Labour a commanding 98-seat majority.",
    detail: "Called just 17 months after 1964, Wilson sought a workable majority and won decisively with 364 seats to 253. It was Labour's largest majority since Attlee's 1945 landslide. Edward Heath had replaced Douglas-Home as Conservative leader but could not prevent the swing to Labour. Turnout fell slightly to 75.8%.",
  },
  1970: {
    headline: "Heath's Conservatives upset the polls to defeat Wilson.",
    detail: "Despite opinion polls predicting a comfortable Labour win, Edward Heath secured a 30-seat majority with 330 seats. Wilson's government had been damaged by economic difficulties, trade union unrest, and devaluation of the pound. The result was one of the biggest polling upsets in British electoral history. Turnout was 72%, down from 75.8% in 1966.",
  },
  197402: {
    headline: "Hung parliament after Heath's 'Who Governs Britain?' election.",
    detail: "Called during the miners' strike and three-day week, Heath asked voters who should run the country but got no clear answer. Labour won 301 seats to the Conservatives' 297, but neither had a majority. After failed coalition talks with the Liberals (14 seats on 19.3%), Wilson formed a minority government. It was the first hung parliament since 1929.",
  },
  197410: {
    headline: "Wilson wins slim majority of 3 in second 1974 election.",
    detail: "Called seven months after February's hung parliament, Wilson sought a workable majority. Labour won 319 seats, just enough for a majority that would erode through by-elections. The SNP won 11 seats, signalling the rise of Scottish nationalism. The Liberals held 13 seats despite their vote share falling from 19.3% to 18.3%.",
  },
  1979: {
    headline: "Thatcher becomes first female PM after Winter of Discontent.",
    detail: "Margaret Thatcher led the Conservatives to a 43-seat majority with 339 seats after widespread public sector strikes had paralysed the country. James Callaghan's Labour fell to 269 seats. The result marked the beginning of 18 years of Conservative government and a fundamental shift in British economic policy towards monetarism and privatisation.",
  },
  1983: {
    headline: "Thatcher wins 144-seat landslide as Alliance splits the left.",
    detail: "Riding the wave of the Falklands War, Thatcher won 397 seats. Michael Foot's Labour collapsed to 209 seats on 27.6% — their worst since 1918. The SDP\u2013Liberal Alliance won 25.4% but only 23 seats, dramatically exposing first-past-the-post distortions. Foot resigned and was succeeded by Neil Kinnock.",
  },
  1987: {
    headline: "Thatcher wins historic third consecutive term.",
    detail: "The Conservatives secured 376 seats and a 102-seat majority despite Neil Kinnock's modernisation of Labour. Labour recovered to 229 seats and 30.8%, beginning their long road back to power. The Alliance fell to 22 seats and subsequently merged to form the Liberal Democrats. Thatcher became the first PM since Lord Liverpool to win three consecutive elections.",
  },
  1992: {
    headline: "Major defies the polls for Conservatives' fourth consecutive win.",
    detail: "John Major won 336 seats and a 21-seat majority in what many consider the greatest polling upset until 2015. Neil Kinnock's Labour won 271 seats despite leading in most pre-election polls. The Liberal Democrats, contesting their first general election under that name, won 20 seats. Major's slim majority would be eroded by by-elections and Maastricht Treaty rebellions.",
  },
  1997: {
    headline: "Blair's New Labour wins historic 179-seat landslide.",
    detail: "Tony Blair won 418 seats, the most in Labour's history, ending 18 years of Conservative government. John Major's Conservatives were reduced to 165 seats, losing every seat in Scotland and Wales. The Liberal Democrats surged to 46 seats, their best since 1929. Turnout was 71.4%, down from 77.7% in 1992.",
  },
  2001: {
    headline: "Blair wins second landslide on record-low 59% turnout.",
    detail: "Labour held 413 seats with a 167-seat majority, barely changed from 1997. William Hague's Conservatives gained just one seat, reaching 166, and Hague resigned immediately. The Liberal Democrats increased to 52 seats. The 59.4% turnout was the lowest since universal suffrage, reflecting public apathy rather than active dissatisfaction.",
  },
  2005: {
    headline: "Blair wins reduced majority as Iraq War takes its toll.",
    detail: "Labour won 355 seats with a 66-seat majority, losing 47 seats largely due to opposition to the Iraq War. Michael Howard's Conservatives gained 33 seats to reach 198 but failed to mount a serious challenge. The Liberal Democrats reached 62 seats, benefiting from anti-war tactical voting. Blair became the first Labour leader to win three consecutive elections.",
  },
  2010: {
    headline: "Hung parliament leads to first coalition since WWII.",
    detail: "David Cameron's Conservatives won 306 seats, 20 short of a majority, while Gordon Brown's Labour fell to 258. Nick Clegg's Liberal Democrats won 57 seats and entered coalition with the Conservatives, the first peacetime coalition since the 1930s. The election saw the first televised leaders' debates in British history, initially boosting Clegg's popularity in 'Cleggmania'.",
  },
  2015: {
    headline: "Cameron wins unexpected majority; UKIP gets 12.6% but one seat.",
    detail: "Defying unanimous poll predictions of another hung parliament, the Conservatives won 331 seats and a 12-seat majority. Ed Miliband's Labour lost 40 Scottish seats to the SNP, who took 56 of 59. The Liberal Democrats collapsed from 57 to 8 seats, punished for their coalition years. UKIP won 3.9 million votes but only one seat, fuelling demands for electoral reform.",
  },
  2017: {
    headline: "May's snap election backfires; Conservatives lose their majority.",
    detail: "Theresa May called an early election expecting to increase her majority but lost 13 seats, falling to 318. Jeremy Corbyn's Labour gained 30 seats to reach 262, confounding expectations of a wipeout. The two main parties together took 82.4% of the vote, the highest since 1970. May formed a confidence-and-supply deal with the DUP's 10 Northern Ireland MPs.",
  },
  2019: {
    headline: "Johnson wins 80-seat majority on 'Get Brexit Done' platform.",
    detail: "Boris Johnson's Conservatives won 365 seats, their best since 1987, breaking through Labour's 'Red Wall' in the Midlands and North. Jeremy Corbyn's Labour fell to 202 seats, their worst since 1935. The SNP won 48 of Scotland's 59 seats, strengthening calls for independence. The Liberal Democrats won 11 seats despite leader Jo Swinson losing her own constituency.",
  },
  2024: {
    headline: "Starmer's Labour wins 174-seat majority in historic swing.",
    detail: "Keir Starmer led Labour to 411 seats, ending 14 years of Conservative government in one of the largest swings in British electoral history. Rishi Sunak's Conservatives collapsed to 121 seats, their worst ever result. Reform UK won 14.3% and 5 seats, splitting the right-wing vote. The Liberal Democrats surged to 72 seats, their best result ever, on just 12.2% of the vote.",
  },
};
