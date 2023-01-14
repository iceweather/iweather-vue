import Http, { requestOption } from '@utils/http';
import Location from '@utils/location/location';
import { WeatherStrategy } from './base';
import { date } from 'quasar';
import { notify } from '@src/utils/utils';
import { qWeatherCode } from '@src/utils/http/code';
import md5 from 'js-md5';

// 处理请求结果
class QWeatherHandler {
  static aqiHandler(res: Record<string, any>): IAir {
    return {
      dateTime: new Date(res.pubTime),
      aqi: Number(res.aqi),
      level: Number(res.level),
      category: res.category,
      components: {
        pm10: Number(res.pm10),
        pm2p5: Number(res.pm2p5),
        no2: Number(res.no2),
        so2: Number(res.so2),
        co: Number(res.co),
        o3: Number(res.o3),
      },
    };
  }

  static sunHandler(res: Record<string, any>): ISun {
    return {
      sunRise: new Date(res.sunrise),
      sunSet: new Date(res.sunset),
    };
  }

  static moonHandler(res: Record<string, any>): IMoon {
    return {
      moonRise: new Date(res.moonrise),
      moonSet: new Date(res.moonset),
      moonPhase: res.moonPhase.map((e: Record<string, any>): IMoonPhase => {
        return {
          dateTime: new Date(e.fxTime),
          value: Number(e.value),
          name: e.name,
          illumination: Number(e.illumination),
          icon: e.icon,
        };
      }),
    };
  }

  static warningHandler(
    res: Array<Record<string, any>> | undefined
  ): Array<IWarning> {
    return typeof res !== 'undefined'
      ? res.map((e: Record<string, any>): IWarning => {
          return {
            dateTime: new Date(e.pubTime),
            start: new Date(e.startTime),
            end: new Date(e.endTime),
            description: e.text,
            title: e.title,
            status: e.status,
            level: e.level,
            type: e.type,
            typeName: e.typeName,
            sender: e.sender ?? '暂无发布单位',
          };
        })
      : [];
  }

  static indicesHandler(res: Array<Record<string, any>>): Array<ILivingIndex> {
    return res.map((e: Record<string, any>): ILivingIndex => {
      return {
        type: Number(e.type),
        name: e.name.replace(/指数/, ''),
        level: Number(e.level),
        category: e.category,
        description: e.text,
      };
    });
  }

  static precipHandler(res: Record<string, any>): IFuturePrecip {
    const noPrecip: boolean = res.minutely.every(
      (e: Record<string, any>) => e.precip === '0.0'
    );

    return {
      summary: res.summary,
      minutely: noPrecip
        ? [] // 未降雨
        : res.minutely.map((e: Record<string, any>): IPrecip => {
            return {
              dateTime: new Date(e.fxTime),
              precip: parseFloat(e.precip),
              type: e.type,
            };
          }),
    };
  }

  static hourlyHandler(res: Record<string, any>): Array<IWeatherItem> {
    return res.map((e: Record<string, any>): IWeatherItem => {
      return {
        dateTime: new Date(e.fxTime),
        temperature: {
          day: Number(e.temp),
        },
        humidity: Number(e.humidity),
        precip: parseFloat(e.precip),
        pressure: Number(e.pressure),
        description: e.text,
        icon: e.icon,
        wind: {
          wind360: Number(e.wind360),
          windDir: e.windDir,
          windScale: e.windScale,
          windSpeed: Number(e.windSpeed),
        },
        clouds: Number(e.cloud),
        dewPoint: Number(e.dew),
        pop: Number(e.pop),
      };
    });
  }

  static dailyHandler(res: Record<string, any>): Array<IDailyItem> {
    return res.map((e: Record<string, any>): IDailyItem => {
      return {
        dateTime: new Date(e.fxDate),
        sun: {
          sunRise: new Date(`${e.fxDate} ${e.sunrise}`),
          sunSet: new Date(`${e.fxDate} ${e.sunset}`),
        },
        moon: {
          moonRise: new Date(`${e.fxDate} ${e.moonrise}`),
          moonSet: new Date(`${e.fxDate} ${e.moonset}`),
          moonPhase: {
            icon: e.moonPhaseIcon,
            name: e.moonPhase,
          },
        },
        temperature: {
          max: e.tempMax,
          min: e.tempMin,
        },
        dayIcon: e.iconDay,
        dayDesc: e.textDay,
        dayWind: {
          wind360: Number(e.wind360Day),
          windDir: e.windDirDay,
          windScale: e.windScaleDay,
          windSpeed: Number(e.windSpeedDay),
        },
        nightIcon: e.iconNight,
        nightDesc: e.textNight,
        nightWind: {
          wind360: Number(e.wind360Night),
          windDir: e.windDirNight,
          windScale: e.windScaleNight,
          windSpeed: Number(e.windSpeedNight),
        },
        humidity: Number(e.humidity),
        precip: parseFloat(e.precip),
        pop: 0,
        pressure: Number(e.pressure),
        visibility: Number(e.vis),
        clouds: Number(e.cloud),
        uvIndex: Number(e.uvIndex),
      };
    });
  }

  static nowWeatherHandler(res: Record<string, any>): IWeatherItem {
    return {
      dateTime: new Date(res.obsTime),
      temperature: {
        day: Number(res.temp),
      },
      feelsLike: {
        day: Number(res.feelsLike),
      },
      humidity: Number(res.humidity),
      precip: Number(res.precip),
      pressure: Number(res.pressure),
      description: res.text,
      icon: res.icon,
      wind: {
        wind360: Number(res.wind360),
        windDir: res.windDir,
        windScale: res.windScale,
        windSpeed: Number(res.windSpeed),
      },
      visibility: Number(res.vis),
      clouds: Number(res.cloud),
      dewPoint: Number(res.dew),
    };
  }
}

const qWeatherLangMap: Record<Languages, string> = {
  'zh-CN': 'zh',
  'zh-TW': 'zh-hant',
  'en-US': 'en',
  'en-GB': 'en',
};

interface signureOptions {
  publicID: string;
  privateKey: string;
  parameterObject: Record<string, string>;
}

// 获取包含签名的请求参数
function getParams(o: signureOptions) {
  const timestamp = String(Math.round(new Date().getTime() / 1000));

  const obj = { ...o.parameterObject };

  obj['t'] = timestamp;
  obj['publicid'] = o.publicID;

  const keys = Object.keys(obj);

  keys.sort();

  let str = '';

  for (const i in keys) {
    const k = keys[i];
    str += k + '=' + obj[k] + '&';
  }

  str = str.substring(0, str.length - 1) + o.privateKey;

  return {
    ...obj,
    sign: md5(str),
  };
}

export default class QWeatherStrategy extends WeatherStrategy {
  private http: Http;

  constructor(
    private key: string,
    private pid: string,
    private lang = 'zh',
    private baseUrl: string = 'https://devapi.qweather.com/v7/'
  ) {
    super();

    this.http = new Http({
      baseUrl: this.baseUrl,
    });

    Http.setRequestInterceptors(this.http.ax);

    Http.setResponseInterceptors(this.http.ax, (resp) => {
      const res = resp.data;
      const code = Number(res.code);

      if (code === 200) {
        return Promise.resolve(res);
      } else {
        notify.negative(qWeatherCode[code as keyof typeof qWeatherCode]);
        return Promise.reject();
      }
    });
  }

  set language(lang: Languages) {
    this.lang = qWeatherLangMap[lang];
  }

  request({ url, data, headers }: requestOption): Promise<any> {
    const d = {
      lang: this.lang,
      ...data,
    };

    return this.http.request({
      url,
      method: 'GET',
      headers,
      data: {
        params: {
          ...getParams({
            parameterObject: d,
            publicID: this.pid,
            privateKey: this.key,
          }),
        },
      },
    });
  }

  // 获取 AQI 指数
  async getAir(loc: Location): Promise<IAir> {
    const res = await this.request({
      url: 'air/now',
      data: { location: loc.toString() },
    });
    
    return QWeatherHandler.aqiHandler(res.now);
  }

  // 获取日出日落时间
  async getSunTime(loc: Location, date_?: string): Promise<ISun> {
    const res = await this.request({
      url: 'astronomy/sun',
      data: {
        location: loc.toString(),
        date: date_ ?? date.formatDate(Date.now(), 'YYYYMMDD'),
      },
    });
    
    return QWeatherHandler.sunHandler(res);
  }

  // 获取月升月落
  async getMoonTime(loc: Location, date_?: string): Promise<IMoon> {
    const res = await this.request({
      url: 'astronomy/moon',
      data: {
        location: loc.toString(),
        date: date_ ?? date.formatDate(Date.now(), 'YYYYMMDD'),
      },
    });
    
    return QWeatherHandler.moonHandler(res);
  }

  // 获取灾害预警
  async getDisasterWarning(loc: Location): Promise<Array<IWarning>> {
    const res = await this.request({
      url: 'warning/now',
      data: { location: loc.toString() },
    });
    
    return QWeatherHandler.warningHandler(res.warning);
  }

  // 获取生活指数, 默认获取全部生活指数
  async getLivingIndices(loc: Location, type = 0): Promise<Array<ILivingIndex>> {
    const res = await this.request({
      url: 'indices/1d',
      data: {
        location: loc.toString(),
        type,
      },
    });
    
    return QWeatherHandler.indicesHandler(res.daily);
  }

  // 获取 2 小时降水
  async getPrecipitationInTheNextTwoHours(loc: Location): Promise<IFuturePrecip> {
    const res = await this.request({
      url: 'minutely/5m',
      data: { location: loc.toString() },
    });
    
    return QWeatherHandler.precipHandler(res);
  }

  // 获取 24 小时天气预报
  async getWeatherByHours(loc: Location): Promise<Array<IWeatherItem>> {
    const res = await this.request({
      url: 'weather/24h',
      data: { location: loc.toString() },
    });
    
    return QWeatherHandler.hourlyHandler(res.hourly);
  }

  // 获取未来 7 天天气预报
  async getWeatherByDays(loc: Location): Promise<Array<IDailyItem>> {
    const res = await this.request({
      url: 'weather/7d',
      data: { location: loc.toString() },
    });
    
    return QWeatherHandler.dailyHandler(res.daily);
  }

  // 获取实时天气预报
  async getNowWeather(loc: Location): Promise<IWeatherItem> {
    const res = await this.request({
      url: 'weather/now',
      data: { location: loc.toString() },
    });
    
    return QWeatherHandler.nowWeatherHandler(res.now);
  }

  async getWeather(loc: Location): Promise<IWeather | void> {
    try {
      const values_1 = await Promise.all([
        this.getAir(loc),
        this.getSunTime(loc),
        this.getMoonTime(loc),
        this.getDisasterWarning(loc),
        this.getLivingIndices(loc),
        this.getPrecipitationInTheNextTwoHours(loc),
        this.getWeatherByHours(loc),
        this.getWeatherByDays(loc),
        this.getNowWeather(loc),
      ]);
      return {
        location: loc,
        air: values_1[0],
        sun: values_1[1],
        moon: values_1[2],
        waring: values_1[3],
        livingIndices: values_1[4],
        precip: values_1[5],
        hourly: values_1[6],
        daily: values_1[7],
        now: values_1[8],
      };
    } catch { }
  }
}

