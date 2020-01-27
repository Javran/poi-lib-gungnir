import * as _ from 'lodash'

import * as kcsapi from '../kcsapi'
import * as yapi from '../yapi'

import {
  convertIntFlag, convertHps, convertDetection,
  convertEngagement, convertFormation,
  convertShipInfoFriend, convertShipInfoEnemy,
  convertCritical, convertDamageWithFlag,
  convertSide, convertAttackType,
} from './basic'

import {
  convertKoukuStages,
} from './kouku'

export * from './basic'
export * from './kouku'

export const convertHougekiDamage =
  (
    df: kcsapi.ShipIndex,
    cl: kcsapi.CriticalFlag,
    damage: kcsapi.DamageE
  ): yapi.HougekiDamage => {
    return {
      target: df,
      critical: convertCritical(cl),
      ...convertDamageWithFlag(damage),
    }
  }

export const convertHougekiSlotitems = (raw: kcsapi.HougekiSlotitems): yapi.HougekiSlotitems => {
  if (raw === null || raw.length === 0) {
    return null
  }
  return raw.map(x => typeof x === 'string' ? parseInt(x, 10) : x)
}

export const convertHougekiTurn =
  (
    atEflag: kcsapi.IntFlag,
    atList: kcsapi.ShipIndex,
    atType: kcsapi.AttackType,
    dfList: Array<kcsapi.ShipIndex>,
    si: kcsapi.HougekiSlotitems,
    clList: Array<kcsapi.CriticalFlag>,
    damage: Array<kcsapi.DamageE>
  ): yapi.HougekiTurn => {
    return {
      source: {
        side: convertSide(atEflag),
        index: atList,
      },
      attackType: convertAttackType(atType),
      slotitems: convertHougekiSlotitems(si),
      damages: (_.zipWith as any)(dfList, clList, damage, convertHougekiDamage),
    }
  }

export const convertHougeki = (raw: kcsapi.Hougeki): yapi.Hougeki => {
  const turns = (_.zipWith as any)(
    raw.api_at_eflag,
    raw.api_at_list,
    raw.api_at_type,
    raw.api_df_list,
    raw.api_si_list,
    raw.api_cl_list,
    raw.api_damage,
    convertHougekiTurn
  )
  return { type: 'Hougeki', turns }
}

export const convertRaigekiTurn =
  (
    rai: kcsapi.ShipIndex,
    cl: kcsapi.CriticalFlag,
    dam: kcsapi.DamageE,
    ydam: kcsapi.DamageE
  ): yapi.RaigekiTurn => {
    return {
      target: rai,
      critical: convertCritical(cl),
      damage: {
        taken: convertDamageWithFlag(dam),
        dealt: convertDamageWithFlag(ydam),
      },
    }
  }

export const convertRaigeki = (raw: kcsapi.Raigeki): yapi.Raigeki => {
  return {
    type: 'Raigeki',
    friend:
      (_.zipWith as any)(
        raw.api_frai,
        raw.api_fcl,
        raw.api_fdam,
        raw.api_fydam,
        convertRaigekiTurn
      ),
    enemy:
      (_.zipWith as any)(
        raw.api_erai,
        raw.api_ecl,
        raw.api_edam,
        raw.api_eydam,
        convertRaigekiTurn
      ),
  }
}

// NOTE: this ordering is only true for normal battles
// combined fleets are more involved.
// instead of using the unguaranteed ordering,
// we should use other clues to figoure out the type
// thus the ordering of these 4 phases instead of guessing the ordering.
export const convertHouraiPhases =
  (
    [f0, f1, f2, f3]: Array<kcsapi.IntFlag>,
    hougeki1: kcsapi.Hougeki | null,
    hougeki2: kcsapi.Hougeki | null,
    hougeki3: kcsapi.Hougeki | null,
    raigeki: kcsapi.Raigeki | null
  ): yapi.HouraiPhases => {
    const ret: yapi.HouraiPhases = []
    // this looks stupid, anything better?
    if (f0) {
      if (hougeki1 === null) {
        throw new Error(`Cannnot convert hougeki1: null`)
      }
      ret.push(convertHougeki(hougeki1))
    }
    if (f1) {
      if (hougeki2 === null) {
        throw new Error(`Cannnot convert hougeki2: null`)
      }
      ret.push(convertHougeki(hougeki2))
    }
    if (f2) {
      if (hougeki3 === null) {
        throw new Error(`Cannnot convert hougeki3: null`)
      }
      ret.push(convertHougeki(hougeki3))
    }
    if (f3) {
      if (raigeki === null) {
        throw new Error(`Cannnot convert raigeki: null`)
      }
      ret.push(convertRaigeki(raigeki))
    }
    return ret
  }

export const convertOpeningAntiSub = (flag: kcsapi.IntFlag, raw: kcsapi.Hougeki | null): yapi.Hougeki | null => {
  // TODO: verify
  if (convertIntFlag(flag) && raw) {
    return convertHougeki(raw)
  }
  return null
}

export const convertOpeningTorpedo = (flag: kcsapi.IntFlag, raw: kcsapi.Raigeki | null): yapi.Raigeki | null => {
  // TODO: verify
  if (convertIntFlag(flag) && raw) {
    return convertRaigeki(raw)
  }
  return null
}

export const convertSupportType = (flag: number): yapi.SupportType | null =>
  (flag === 0) ? null
    : (flag >= 1 && flag <= 4) ? (flag as yapi.SupportTypeE)
      : new yapi.Unknown(flag, 'SupportType')

export const convertSupportInfo = (flag: number, raw: kcsapi.SupportInfo): yapi.SupportInfo | null => {
  const type = convertSupportType(flag)
  if (type === yapi.SupportTypeE.Shelling || type === yapi.SupportTypeE.Torpedo) {
    // should convert to SupportInfoHourai
    const rawDetail = raw.api_support_hourai
    if (rawDetail === null) {
      throw new Error(`api_support_hourai shouldn't be null.`)
    }
    const ships: Array<yapi.SupportInfoShip> = (_.zipWith as any)(
      rawDetail.api_ship_id,
      rawDetail.api_undressing_flag,
      (rosterId: number, uFlg: kcsapi.IntFlag) => ({
        rosterId,
        undressing: convertIntFlag(uFlg),
      })
    )
    const attackInfo: Array<yapi.SupportInfoHouraiDamage> = (_.zipWith as any)(
      rawDetail.api_cl_list,
      rawDetail.api_damage,
      (cl: kcsapi.CriticalFlag, dmg: kcsapi.DamageE) => ({
        critical: convertCritical(cl),
        damage: convertDamageWithFlag(dmg),
      })
    )
    return {
      type,
      deckId: rawDetail.api_deck_id,
      ships,
      attackInfo,
    }
  }
  // TODO: convert for Airstrike and Antisub.
  return new yapi.Unknown({ flag, raw }, 'SupportInfo')
}

export const convertBattle = (raw: kcsapi.Battle): yapi.Battle => {
  // IIFE for now, until do-expression becomes available.
  const [fForm, eForm, engagement] = raw.api_formation

  const enemyShipInfo = (() => {
    const l = raw.api_eParam.length
    if ([raw.api_ship_ke, raw.api_ship_lv, raw.api_eSlot].some(arr => arr.length !== l)) {
      throw new Error(`Cannot convert enemy ship info, some array lengths are mismatching.`)
    }
    return _.zipWith(raw.api_eParam, raw.api_ship_ke, raw.api_ship_lv, raw.api_eSlot, convertShipInfoEnemy)
  })()

  const detection = (() => {
    const [f, e] = raw.api_search
    return {
      friend: convertDetection(f),
      enemy: convertDetection(e),
    }
  })()

  return {
    deckId: raw.api_deck_id,
    engagement: convertEngagement(engagement),
    formation: {
      friend: convertFormation(fForm),
      enemy: convertFormation(eForm),
    },
    hps: {
      friend: convertHps(raw.api_f_nowhps, raw.api_f_maxhps),
      enemy: convertHps(raw.api_e_nowhps, raw.api_e_maxhps),
    },
    shipInfo: {
      friend: _.map(raw.api_fParam, convertShipInfoFriend),
      enemy: enemyShipInfo,
    },
    pursueFlag: convertIntFlag(raw.api_midnight_flag),
    detection,
    koukuStages: convertKoukuStages(raw.api_stage_flag, raw.api_kouku),
    openingAntiSub: convertOpeningAntiSub(raw.api_opening_taisen_flag, raw.api_opening_taisen || null),
    openingTorpedo: convertOpeningTorpedo(raw.api_opening_flag, raw.api_opening_atack || null),
    houraiPhases: convertHouraiPhases(
      raw.api_hourai_flag,
      raw.api_hougeki1,
      raw.api_hougeki2,
      raw.api_hougeki3,
      raw.api_raigeki
    ),
  }
}
