/* eslint-disable no-console */
/*
  TODO:
    - Refactor "getPortfolio"
    * Need to determine how to fetch the current portfolio from the database.
    * What kind of database.
    * What's the difference between the database Schema and the asset object from the Front End?
     - Front end should draw from the database.
     - Back end should draw from the database.
     - Desired changes made in the front end should be sent as "desired changes" to the database and stored.  Redux will simply articulate what's stored in the Back End database.
*/
import { Promise as bbPromise } from 'bluebird';
import bittrexApi from 'node-bittrex-api';
import binance from 'node-binance-api';

bittrexApi.options({
  apikey: process.env.BITTREX_API_KEY,
  apisecret: process.env.BITTREX_API_SECRET,
  inverse_callback_arguments: true,
});

const _getMarketSummary = asset =>
  new Promise((resolve, reject) => {
    let binancePrices = {};

    binance.prices((tickers) => {
      if (!Object.keys(tickers)) reject('Could not fetch prices from Binance.');
      binancePrices = { ...tickers };
    });


    const marketSummary = asset.prices.reduce((acc, next) => {
      switch (next.exchange) {

        case 'bittrex': {
          acc.bittrexApiRequests.push(
            bbPromise
            .fromCallback(cb =>
              bittrexApi.getmarketsummary({ market: next.symbol }, cb))
            .then(resolve)
            .catch(reject)
          );
          return acc;
        }

        case 'binance': {
          const currentPrice = binancePrices[next.symbol.split('-').join('')];
          next.price = currentPrice;
          acc.updatedAssets[next.symbol] = { ...next };
          return acc;
        }

        default: return acc;
      }
    }, {
      bittrexApiRequests: [],
      currentAssetPrices: {},
    });
    resolve(marketSummary);
    /* getMarketSummary result =
    {
      MarketName: 'BTC-SALT',
      High: 0.00096938,
      Low: 0.00079153,
      Volume: 1235298.63211953,
      Last: 0.00090106,
      BaseVolume: 1109.3424853,
      TimeStamp: '2018-01-02T05:32:45.267',
      Bid: 0.00089936,
      Ask: 0.00090106,
      OpenBuyOrders: 1660,
      OpenSellOrders: 3754,
      PrevDay: 0.000882,
      Created: '2017-10-16T17:32:48.777'
    }
    */
  });

const _getPortfolio = assets =>
  assets.reduce((acc, n) => ({
    ...acc,
    [n.symbol]: { ...n },
  }), {});

const _getAssetPriceReq = assets =>
  assets.map(asset => _getMarketSummary(asset.prices));

const getAssetPrices = assets =>
  new Promise((resolve, reject) => {
    // Call 3rd party exchange and fetch prices for each asset.
    // Calculate current asset value compared to it's Bitcoin value and dollar value.
    // Reduce the overall amount.
    // Return result.
    const
      portfolio = _getPortfolio(assets),
      {
        bittrexApiRequests,
        currentAssetPrices,
      } = _getAssetPriceReq(assets);

    Promise.all([
      ...bittrexApiRequests,
    ])
    .then((results) => {
      let USD_BTC = '';

      // a) iterate through bittrex results and extract USD value from each asset.
      // b) add bittrex price to "updatedAsset" prices as a whole.
      const prices = results
      .map(({ result }) => {
        const
          resultPrice = Number(result[0].Last),

          resultSymbol = result[0].MarketName,

          updatedAssetPrices = currentAssetPrices[resultSymbol]
          .prices.map((priceObj) => {
            if (priceObj.exchange === 'bittrex') {
              priceObj.price = resultPrice;
              return priceObj;
            }
            return priceObj;
          });
        console.log('updatedAssetPrices: ', updatedAssetPrices);

        if (resultSymbol === 'USDT-BTC') USD_BTC = resultPrice;

        return ({
          symbol: resultSymbol,
          btcPrice: USD_BTC,
          updatedAssetPrices,
        });
      });

      resolve({
        prices,
        portfolio,
        usdBtc: USD_BTC,
      });
    })
    .catch(reject);
  });

const rebalancePortfolio = (totalValue, portfolio) => {
  const rebalanceSummary = Object
  .keys(portfolio)
  .map(symbol => portfolio[symbol])
  .reduce((acc, n, i, array) => {
    // identify new tokens added to portfolio.
    // determine all tokens with custom percentages.
    // infer all tokens with non-custom percentages.
    // calculate non-custom token percentage distribution each.
    // calculate percentage change per token between: "changed" & "unchanged".
    // add auto token + amount to "re-allocation" pool.
    // send re-allocation token to exchange & cash out to Bitcoin.
    // buy new desired asset with custom percentage factor.
    // send new tokens to app.

    if (
      !n.balance &&
      !n.percentages.current &&
      n.percentages.desired
    ) {
      console.log('Found new token.');
      acc.custom.push(n);
      acc.newTokens.push(n);
      acc.customPercentTotal += Number(n.percentages.desired);
    } else if (n.percentage.desired) {
      console.log('Found custom percentage change for token: ', n.symbol);
      acc.custom.push(n);
      acc.customPercentTotal += Number(n.percentages.desired);
      if (n.percentage.desired < n.percentage.current) {
        console.log('Custom percentage is less than current percentage.');
        acc.reAllocationPool.push(n);
      }
    } else if (
      n.balance &&
      n.percentages.current &&
      (!n.percentages.desired || (n.percentages.desired === '0'))
    ) {
      console.log('Found undesired token with balance: ', n.symbol, '\nbalance: ', n.balance);
      acc.reAllocationPool.push(n);
    } else if (
      n.percentages.desired &&
      n.percentages.current &&
      n.percentages.desired === n.percentages.current
    ) {
      console.log('Found generic token with no changes.');
      acc.auto.push(n);
      acc.reAllocationPool.push(n);
    }

    // const reqPercent = n.percentages.desired || 0;
    // const currPercent = n.percentages.current || 0;
    //
    // if (reqPercent) {
    //   if (currPercent) {
    //     if (reqPercent > currPercent) acc.increased.push(n);
    //
    //     if (reqPercent !== currPercent) acc.reqPercent += Number(reqPercent);
    //   } else {
    //     console.log('Adding new token to portfolio: ', symbol); // eslint-disable-line
    //   }
    // } else if (!currPercent) {
    //   console.log('You are missing a current & request percent for asset: ', n.symbol, '\nAsset will be discluded from your portfolio entirely.'); // eslint-disable-line
    // }
    //
    // if (i === (array.length - 1)) acc.otherPercent = 1 - acc.reqPercent;
    // acc.totalAssets += 1;
    //
    // return acc;
  }, {
    custom: [],
    auto: [],
    newTokens: [],
    totalAssets: 0,
    autoPercentTotal: 0,
    customPercentTotal: 0,
    reAllocationPool: [],
  });

  console.log('rebalanceSummary: ', rebalanceSummary);
};

const getPortfolioValue = (prices, usdBtc, portfolio) => {
  const portfolioValue = prices.reduce((acc, { symbol, btcPrice }) => {
    let tokenValue = symbol === 'BTC' ? btcPrice : usdBtc * btcPrice;

    portfolio[symbol] = {
      ...portfolio[symbol],
      prices: {
        btc: Number(btcPrice),
        usd: tokenValue,
      },
      value: Number(portfolio[symbol].balance) * tokenValue,
    };
    return (acc += portfolio[symbol].value);
  }, 0);

  return ({
    portfolio,
    portfolioValue,
  });
};

const deposit = (newAsset, assets) => {
  if (!newAsset && typeof newAsset !== 'object') throw Error('Invalid argument "newAsset".');

  if (!assets && typeof assets !== 'object') throw Error('Invalid argument "assets".');

  /* Check current value of assets.
  - Fetch each Asset Price BTC-<Asset>
  - Get current overall portfolio value.
  - Assign new portfolio per new custom settings.
  */
  getAssetPrices(assets)
  .then(({ prices, usdBtc, portfolio }) =>
    getPortfolioValue(prices, usdBtc, portfolio))
  .then(({ portfolioValue, portfolio }) =>
    rebalancePortfolio(portfolioValue, portfolio)
  ).catch(console.log);
};

console.log(
  deposit(
    {
      amount: 1,
      asset: 'BTC',
      from: '000000000123',
    },
    [
      {
        symbol: 'SALT',
        marketName: 'Salt',
        contractAddress: '0x123123123123',
        publicExgAddress: '0x123123123',
        coldStorageAddress: '0x123123123',
        decimals: '18',
        balance: '950',
        prices: [{
          exchange: 'bittrex',
          symbol: 'BTC-SALT',
          price: '',
        }, {
          exchange: 'bittrex',
          symbol: 'ETH-SALT',
          price: '',
        }],
        percentages: {
          current: '.2',
          desired: '.3',
        },
      }, {
        symbol: 'ADA',
        marketName: 'Cardano',
        contractAddress: '0x123123123123',
        publicExgAddress: '0x123123123',
        exchange: 'bittrex',
        coldStorageAddress: '0x123123123',
        decimals: '18',
        balance: '1000',
        prices: {
          'BTC-ADA': '',
          'ETH-ADA': '',
        },
        percentages: {
          current: '.2',
          desired: '.3',
        },
      }, {
        symbol: 'BTC',
        marketName: 'Bitcoin',
        contractAddress: '0x123123123123',
        publicExgAddress: '0x123123123',
        exchange: 'bittrex',
        coldStorageAddress: '0x123123123',
        decimals: '18',
        balance: '15',
        prices: {
          'USDT-BTC': '',
          'BTC-ETH': '',
        },
        percentages: {
          current: '.2',
          desired: '.3',
        },
      }, {
        symbol: 'ETH',
        marketName: 'Ethereum',
        contractAddress: '0x123123123123',
        publicExgAddress: '0x123123123',
        exchange: 'bittrex',
        coldStorageAddress: '0x123123123',
        decimals: '18',
        balance: '6',
        prices: {
          'BTC-ETH': '',
          'USDT-ETH': '',
        },
        percentages: {
          current: '.2',
          desired: '.3',
        },
      }, {
        symbol: 'BCC',
        marketName: 'Bitcoin Cash',
        contractAddress: '0x123123123123',
        publicExgAddress: '0x123123123',
        exchange: 'bittrex',
        coldStorageAddress: '0x123123123',
        decimals: '18',
        balance: '2',
        prices: {
          'BTC-BCC': '',
          'ETH-BCC': '',
        },
        percentages: {
          current: '.2',
          desired: '.3',
        },
      },
    ],
  )
);
