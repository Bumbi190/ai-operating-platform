/** SNI2025, SCB definitions verified 2026-11-04 at https://snisok.scb.se/{digits}. */
export const COMPANY_INDUSTRIES={
 car_dealer:{label:'Bilhandlare',registeredLabel:'Personbilar och lätta motorfordon',sni:'47.811'},
 restaurant:{label:'Restauranger',registeredLabel:'Restaurangverksamhet',sni:'56.110'},
 hairdresser:{label:'Frisörer och barberare',registeredLabel:'Frisörer och barberare',sni:'96.210'},
 house_builder:{label:'Husbyggare',registeredLabel:'Byggande av bostadshus och andra byggnader',sni:'41.000'},
} as const
export type CompanyIndustry=keyof typeof COMPANY_INDUSTRIES
export function isCompanyIndustry(value:unknown):value is CompanyIndustry{return typeof value==='string'&&Object.prototype.hasOwnProperty.call(COMPANY_INDUSTRIES,value)}
