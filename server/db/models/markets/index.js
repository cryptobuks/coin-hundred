/* eslint-disable import/prefer-default-export, no-use-before-define */
import bittrexApi from 'node-bittrex-api';
import mongoose from 'mongoose';
import { Promise as bbPromise } from 'bluebird';
import { marketsSchema } from '../../schemas/markets';

import {
  _getBinancePrices,
  _getBittrexPrices,
  _cleanBinancePrices,
  _cleanBittrexPrices,
} from './helpers';

bittrexApi.options({
  apikey: process.env.BITTREX_API_KEY,
  apisecret: process.env.BITTREX_API_SECRET,
  inverse_callback_arguments: true,
});

marketsSchema.statics.getPrices = () => {
  Promise.all([
    _getBinancePrices(),
    _getBittrexPrices(),
  ])
  .then((prices) => {
    return Markets.createOrUpdateMarketDocs({
      exchanges: {
        binance: _cleanBinancePrices(prices[0]),
        bittrex: _cleanBittrexPrices(prices[1].result),
      },
    });
  })
  .then(() => {
    console.log('success.');
  })
  .catch((err) => {
    console.log('err: ', err);
  });
};

marketsSchema.statics.findMarket = marketObj =>
  new Promise((resolve, reject) => {
    if (!Object.keys(marketObj).length) reject('Must supply required @param "marketObj".');
    if (marketObj && typeof marketObj !== 'object') reject('Must supply an object for @param "marketObj".');

    Markets
    .findOne(marketObj.symbol)
    .exec()
    .then((dbMarket) => {
      if ('_id' in dbMarket) {
        resolve({
          result: true,
          market: { ...marketObj },
        });
      } else {
        resolve({
          result: false,
          market: { ...marketObj },
        });
      }
    })
    .catch(reject);
  });

marketsSchema.statics.createMarket = marketObj =>
  new Promise((resolve, reject) => {
    if (!Object.keys(marketObj).length) reject('Must supply required @param "marketObj" to @func "createMarket".');
    if (marketObj && typeof marketObj !== 'object') reject('Must supply an {object} for @param "marketObj" to @func "createMarket".');

    bbPromise.fromCallback(cb =>
      Markets.create({ ...marketObj.market }, cb)
    )
    .then((newMarket) => {
      if ('_id' in newMarket) resolve();
      else reject('FAILED: @func "createMarket".');
    })
    .catch(reject);
  });

marketsSchema.statics.findMarketAndUpdate = marketObj =>
  new Promise((resolve, reject) => {
    
  });

marketsSchema.statics.createOrUpdateMarketDocs = ({ exchanges }) =>
new Promise((resolve, reject) => {
  // iterate through bittrex & binance and check for existing documents.
  // if none is found, create a new one.
  // if is found, update existing document's price with current price.

  const lookupRequests = [];
  let markets = {};

  Object
  .keys(exchanges)
  .forEach((exchangeKey) => {
    markets = {
      ...markets,
      [exchangeKey]: {
        ...exchanges[exchangeKey],
      },
    };

    Object
    .keys(markets)
    .forEach((marketKey) => {
      lookupRequests.push(Markets.findMarket(marketKey));
    });
  });

  Promise.all([
    ...lookupRequests,
  ])
  .then((results) => {
    const createOrUpdateReqs = results.map(({ result, symbol }) => {
      if (result) return Markets.updateMarket(markets[symbol]);
      return Markets.createMarket(markets[symbol]);
    });
    return Promise.all(createOrUpdateReqs);
  })
  .then(() => {
    console.log('finished updated or creating markets.');
  })
  .catch(reject);
});

export const Markets = mongoose.model('Markets', marketsSchema);
