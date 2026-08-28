# Omnira Trading System

## Datamodell v0.1

Dokumentspråk: Svenska
Status: Fas 0 – Datamodell för granskning
System: Omnira Trading System
Primär strategi: Omnira Liquidity Manipulation – Canonical v1.0
Arkitektur: Omnira Trading System – Systemarkitektur v0.3

## 1. Syfte

Detta dokument definierar den logiska datamodellen för Omnira Trading System.

Datamodellen ska stödja hela systemets livscykel från:

- market analysis
- strategy detection
- AI analysis
- risk evaluation
- prop firm evaluation
- trade proposal
- approval
- execution
- position management
- journal
- analytics
- backtesting
- forward testing
- demo
- controlled live trading
Datamodellen ska vara byggd så att historiska beslut går att rekonstruera i efterhand.

## 2. Grundprincip

Systemets data ska skilja tydligt mellan:

- vad marknaden gjorde
- vad strategin såg
- vad AI:n bedömde
- vad Risk Engine beslutade
- vad Prop Firm Engine beslutade
- vad användaren godkände
- vad Execution Runner skickade
- vad brokern faktiskt exekverade
- vad resultatet blev
Dessa ska inte lagras som ett enda generiskt "trade"-objekt.

## 3. Huvudentiteter

Datamodellen ska minst stödja följande huvudobjekt:

- TradingProject
- Broker
- TradingAccount
- PropFirmProfile
- Instrument
- MarketDataSource
- Strategy
- StrategyVersion
- StrategyConfiguration
- TradingSession
- MarketContext
- LiquidityLevel
- FVGZone
- SMTObservation
- StrategySetup
- StrategySignal
- AIAnalysis
- RiskProfile
- RiskRule
- RiskDecision
- PropRule
- PropDecision
- TradeProposal
- Approval
- ExecutionIntent
- Order
- Fill
- Position
- Trade
- TradeJournalEntry
- MarketSnapshot
- PerformanceRecord
- SystemEvent
- ExecutionRunner
- KillSwitchState
## 4. Identifierare

Alla centrala objekt ska ha stabila unika identifierare.

Exempel:

```
account_id
strategy_id
strategy_version_id
setup_id
signal_id
proposal_id
risk_decision_id
execution_id
order_id
position_id
trade_id
```

Identifierare får inte baseras enbart på namn eller timestamps.

## 5. TradingProject

Trading ska vara en isolerad projektdomän i Omnira.

TradingProject ska minst kunna innehålla:

- id
- slug
- name
- status
- environment
- created_at
- updated_at
Exempel:

omnira-trading

Projektet ska vara parent context för tradingdata där det är relevant.

## 6. Broker

Broker beskriver den externa tradingmotparten eller exekveringsmiljön.

Fält:

- broker_id
- name
- broker_type
- platform
- server_name
- environment
- timezone
- status
- metadata
Exempel på platform:

Futures Execution Provider (specifik provider ej vald, se GATE-15)

Broker får inte innehålla credentials direkt i normal databastabell.

## 7. TradingAccount

TradingAccount representerar ett specifikt konto.

Fält:

- account_id
- broker_id
- external_account_reference
- account_type
- currency
- environment
- prop_firm_profile_id
- balance
- equity
- margin
- free_margin
- leverage
- account_status
- trading_enabled
- created_at
- updated_at
- last_synced_at
Account type kan exempelvis vara:

- demo
- personal_live
- prop_challenge
- prop_funded
- backtest_virtual
## 8. Kontoidentitet och secrets

Kontots login credentials ska inte lagras tillsammans med normal account metadata.

Databasen ska endast innehålla en referens till secret storage där sådan integration krävs.

Exempel:

```
credential_secret_ref
```

Aldrig:

```
password = "..."
```

i vanlig tradingdata eller loggar.

## 9. PropFirmProfile

PropFirmProfile beskriver vilken extern regeluppsättning kontot tillhör.

Fält:

- prop_firm_profile_id
- provider_name
- program_name
- challenge_type
- version
- effective_from
- effective_until
- status
- ruleset_reference
En profil ska kunna versionshanteras.

## 10. Instrument

Instrument definierar ett handlingsbart instrument.

Fält:

- instrument_id
- canonical_symbol
- broker_symbol
- asset_class
- exchange
- quote_currency
- tick_size
- tick_value
- contract_size
- minimum_quantity
- quantity_step
- trading_timezone
- enabled
- metadata
Exempel:

```
MNQ
```

och:

NQ

ska vara separata instrument även om de följer samma underliggande marknad.

## 11. Symbol Mapping

Ett canonical instrument ska kunna mappas till olika broker-symboler.

Exempel:

Canonical:

```
MNQ
```

Broker A:

```
MNQZ26
```

Broker B:

```
MNQ
```

Detta ska lösas genom mapping och inte genom hårdkodning i Strategy Engine.

## 12. MarketDataSource

MarketDataSource beskriver varifrån marknadsdata kommer.

Fält:

- source_id
- provider
- source_type
- environment
- latency_class
- status
- last_seen_at
Exempel:

- futures execution provider feed
- separat market-data provider
- historical dataset
- backtest dataset
- framtida extern market-data provider
## 13. Market Bar

OHLCV-data ska representeras separat.

Fält:

- instrument_id
- source_id
- timeframe
- open_time
- close_time
- open
- high
- low
- close
- volume
- tick_volume
- spread_data när tillgängligt
- is_complete
- quality_status
Canonical timestamp ska lagras i UTC.

## 14. Tick Data

När tick-data används ska minst kunna lagras eller strömmas:

- timestamp
- instrument
- bid
- ask
- last
- volume
- source
Det ska vara möjligt att använda tick-data vid execution simulation och framtida precisionstester utan att Strategy Engine blir beroende av den från början.

## 15. Strategy

Strategy representerar själva strategifamiljen.

Fält:

- strategy_id
- name
- description
- owner
- status
- created_at
Exempel:

Omnira Liquidity Manipulation

Strategy innehåller inte själva versionsspecifika reglerna.

## 16. StrategyVersion

Varje materiell strategiversion ska representeras separat.

Fält:

- strategy_version_id
- strategy_id
- version
- status
- specification_reference
- checksum/hash när relevant
- created_at
- activated_at
- deprecated_at
Exempel:

Canonical v1.0

Historisk performance ska alltid kunna kopplas till exakt strategy version.

## 17. StrategyConfiguration

Konfigurerbara parametrar ska separeras från själva strategy implementation.

Exempel:

- minimum_setup_grade
- max_attempts_per_thesis
- allowed_sessions
- minimum_rr
- news_blackout_before
- news_blackout_after
- SMT_enabled
- allowed_instruments
Fält:

- config_id
- strategy_version_id
- environment
- parameters
- created_at
- activated_at
- retired_at
Ändrade parametrar som påverkar tradingresultat måste versionshanteras.

## 18. TradingSession

TradingSession representerar den session som analysen tillhör.

Fält:

- session_id
- session_type
- timezone
- start_time
- end_time
- trading_date
- relevant_4h_open
- status
För första strategin:

- London
- New York
## 19. MarketContext

MarketContext samlar den marknadskontext som finns vid en potentiell setup.

Fält kan inkludera:

- context_id
- instrument_id
- session_id
- strategy_version_id
- reference_time
- market_regime
- volatility_state
- trend_state
- session_state
- news_state
- data_quality_state
MarketContext ska kunna återanvändas av både Strategy Engine, AI och journal.

## 20. LiquidityLevel

Identifierad liquidity ska lagras som strukturerade objekt.

Fält:

- liquidity_id
- instrument_id
- timeframe
- liquidity_type
- price
- direction
- formed_at
- confirmed_at
- swept_at
- active
- source_context
- confidence/detection_metadata
Liquidity type kan exempelvis vara:

- swing_high
- swing_low
- equal_high
- equal_low
- previous_session_high
- previous_session_low
- previous_4h_high
- previous_4h_low
- previous_day_high
- previous_day_low
- intermediate_high
- intermediate_low
## 21. FVGZone

Fair Value Gap ska vara eget dataobjekt.

Fält:

- fvg_id
- instrument_id
- timeframe
- direction
- lower_price
- upper_price
- formed_at
- source_candle_1
- source_candle_2
- source_candle_3
- touched_at
- filled_at
- active
Det ska gå att visualisera exakt samma FVG i Atlas Market View som Strategy Engine använder.

## 22. SMTObservation

SMT lagras separat från setup grade.

Fält:

- smt_id
- primary_instrument
- comparison_instrument
- timeframe
- direction
- reference_liquidity_primary
- reference_liquidity_comparison
- detected_at
- valid
- metadata
SMT får sedan bidra till A+ grade.

## 23. StrategySetup

StrategySetup representerar en potentiell tradingidé innan full entry-confirmation finns.

Fält:

- setup_id
- strategy_version_id
- account_id
- instrument_id
- session_id
- direction
- thesis_started_at
- relevant_4h_open
- target_context
- manipulation_target_type
- manipulation_target_id
- state
- attempt_number
- expires_at
Setup state kan exempelvis vara:

- waiting_manipulation
- manipulation_confirmed
- waiting_confirmation
- ready
- invalidated
- expired
- completed
## 24. Strategy State History

En setups state transitions ska loggas.

Exempel:

```
WAIT_FOR_MANIPULATION
→
MANIPULATION_CONFIRMED
→
WAIT_FOR_CONFIRMATION
→
STRATEGY_SIGNAL
```

Varje transition ska kunna innehålla:

- previous_state
- new_state
- timestamp
- reason
- triggering_data_reference
Detta gör Atlas state visuellt förklarbar.

## 25. StrategySignal

StrategySignal skapas när Strategy Engine anser att setupen uppfyller strategikraven.

Fält:

- signal_id
- setup_id
- strategy_version_id
- direction
- signal_time
- setup_grade
- entry_price
- technical_stop
- target_price
- initial_rr
- ifvg_detected
- cisd_detected
- smt_detected
- liquidity_sweep_detected
- signal_status
- explanation_data
StrategySignal är inte en order.

## 26. AIAnalysis

AI-bedömningen ska lagras separat från deterministic Strategy Signal.

Fält:

- ai_analysis_id
- signal_id
- model_reference
- prompt/version reference
- created_at
- analysis_summary
- market_regime_assessment
- confidence
- concerns
- supporting_factors
- contradicting_factors
AI confidence får aldrig användas som hard risk override.

## 27. RiskProfile

RiskProfile representerar en konfigurerad riskmodell för ett konto eller environment.

Fält:

- risk_profile_id
- name
- version
- account_scope
- environment
- status
- effective_from
- effective_until
## 28. RiskRule

Varje riskregel ska vara separat identifierbar.

Exempel:

- max_risk_per_trade
- max_daily_loss
- max_total_drawdown
- max_open_positions
- max_attempts_per_thesis
- max_trades_per_day
- max_instrument_exposure
- correlation_limit
- spread_limit
- news_rule
- cooldown_rule
Fält:

- risk_rule_id
- risk_profile_id
- rule_type
- parameters
- severity
- hard_limit
- enabled
- version
## 29. RiskDecision

Varje Strategy Signal som når Risk Engine ska generera ett RiskDecision.

Fält:

- risk_decision_id
- signal_id
- account_id
- risk_profile_id
- evaluated_at
- result
- proposed_quantity
- risk_amount
- risk_percentage
- daily_loss_remaining
- drawdown_remaining
- rules_evaluated
- failed_rules
- reason_codes
Resultat:

- ALLOW
- DENY
- framtida ALLOW_REDUCED_SIZE
## 30. Risk Rule Evaluation

Varje enskild regelutvärdering bör kunna sparas.

Exempel:

```
max_risk_per_trade = PASS
max_daily_loss = PASS
open_positions = PASS
spread_limit = FAIL
```

Detta gör att användaren kan se exakt varför Risk Engine stoppade en trade.

## 31. PropRule

Prop firm-regler ska representeras separat från intern risk.

Fält:

- prop_rule_id
- prop_firm_profile_id
- rule_type
- parameters
- calculation_method
- reset_policy
- effective_from
- effective_until
- source_reference
- version
- enabled
## 32. PropDecision

Varje trade proposal ska kunna få ett separat PropDecision.

Fält:

- prop_decision_id
- signal_id
- account_id
- prop_firm_profile_id
- evaluated_at
- result
- failed_rules
- headroom
- reason_codes
Resultat:

- ALLOW
- DENY
## 33. TradeProposal

TradeProposal är den fullständiga tradingplan som kan visas i Omnira.

Fält:

- proposal_id
- signal_id
- account_id
- instrument_id
- strategy_version_id
- direction
- setup_grade
- entry
- stop_loss
- take_profit
- rr
- quantity
- risk_amount
- risk_percentage
- AI analysis reference
- RiskDecision reference
- PropDecision reference
- proposal_status
- created_at
- expires_at
## 34. Proposal Status

Status ska vara explicit.

Exempel:

- created
- risk_denied
- prop_denied
- awaiting_approval
- approved
- rejected
- expired
- execution_requested
- executed
- execution_failed
- cancelled
Statusändringar ska loggas.

## 35. Approval

Approval ska vara ett separat objekt.

Fält:

- approval_id
- proposal_id
- approval_type
- approved_by
- decision
- decided_at
- expires_at
- environment
- metadata
Approval type kan exempelvis vara:

- manual
- automation_policy
Historisk approval får inte ändras i efterhand.

## 36. ExecutionIntent

När en proposal är godkänd skapas ett ExecutionIntent.

Fält:

- execution_id
- proposal_id
- account_id
- runner_id
- instrument
- side
- quantity
- order_type
- expected_entry
- maximum_allowed_deviation
- stop_loss
- take_profit
- created_at
- expires_at
- idempotency_key
- status
ExecutionIntent ska vara immutabelt efter att det skickats.

## 37. Execution Status

ExecutionIntent ska kunna ha status:

- created
- dispatched
- received
- revalidating
- denied
- submitted
- acknowledged
- filled
- partially_filled
- rejected
- failed
- expired
- reconciled
## 38. Order

Order representerar ordern hos providern/brokern.

Fält:

- order_id
- execution_id
- broker_order_id
- account_id
- instrument_id
- side
- order_type
- requested_quantity
- requested_price
- stop_loss
- take_profit
- submitted_at
- broker_status
- rejection_code
- raw_broker_reference
## 39. Fill

En order kan generera ett eller flera fills.

Fält:

- fill_id
- order_id
- broker_deal_id
- filled_quantity
- fill_price
- commission
- fee
- spread_cost
- slippage
- filled_at
Detta gör att execution quality kan mätas separat från strategins kvalitet.

## 40. Position

Position representerar aktuell brokerposition.

Fält:

- position_id
- account_id
- instrument_id
- originating_trade_id
- broker_position_id
- side
- quantity
- average_entry
- current_sl
- current_tp
- unrealized_pnl
- opened_at
- updated_at
- position_status
## 41. Position Management Event

Alla förändringar av öppen position ska loggas.

Exempel:

- break_even_triggered
- break_even_trigger_type (SWING | WINDOW_CLOSE)
- stop_moved_to_entry
- TP_hit
- SL_hit
- news_exit
- time_exit
- manual_close
- reconciliation_adjustment
Varje event ska innehålla:

- timestamp
- previous_state
- new_state
- reason
- source
## 42. Trade

Trade representerar det fullständiga livscykelresultatet efter att en faktisk position har existerat.

Fält:

- trade_id
- proposal_id
- strategy_version_id
- account_id
- instrument_id
- direction
- quantity
- entry_time
- entry_price
- initial_sl
- initial_tp
- exit_time
- exit_price
- exit_reason
- gross_pnl
- net_pnl
- initial_risk
- final_r
- MFE
- MAE
- commission
- fees
- slippage
- result_classification
Resultatklassifikation kan exempelvis vara:

- win
- loss
- break_even
- forced_news_exit
- time_exit
- manual_exit
- execution_error
## 43. TradeJournalEntry

TradeJournalEntry ska kunna innehålla både maskin- och människoläsbar information.

Fält:

- journal_id
- trade_id
- setup_id
- proposal_id
- created_at
- entry_type
- summary
- notes
- tags
- market_regime
- lessons
- attachments
- chart_snapshot_reference
Journal ska kunna användas både av användaren och Atlas.

## 44. Nekade setups

En setup behöver inte bli en Trade för att vara värdefull data.

Systemet ska behålla minst:

- setup
- signal
- risk decision
- prop decision
- rejection reason
för relevanta nekade setups.

Detta möjliggör counterfactual analysis.

## 45. MarketSnapshot

Vid viktiga beslutspunkter ska systemet kunna skapa MarketSnapshot.

Snapshot kan innehålla:

- timestamp
- instrument
- relevant bars
- active liquidity levels
- active FVG zones
- SMT state
- strategy state
- current spread
- news state
- account state
Snapshot kan senare användas för:

- replay
- UI
- journal
- debugging
- audit
## 46. Chart Snapshot

Systemet bör kunna spara:

- renderad chartbild
- eller tillräcklig strukturerad chart-data för rekonstruktion
Strukturerad data är source of truth.

Bild är ett hjälpmedel för mänsklig granskning.

## 47. PerformanceRecord

Performance ska kunna aggregeras utan att historiska Trade-objekt förändras.

PerformanceRecord kan innehålla:

- scope
- strategy_version
- account
- instrument
- session
- setup_grade
- period
- trade_count
- win_rate
- expectancy
- average_r
- profit_factor
- max_drawdown
- MFE
- MAE
- metrics_created_at
Aggregat ska alltid kunna räknas om från rådata.

## 48. BacktestRun

Backtesting ska få en egen entitet.

Fält:

- backtest_run_id
- strategy_version_id
- configuration_id
- dataset_reference
- instruments
- date_range
- execution_model_version
- started_at
- completed_at
- status
- result_summary
- code_version
- data_version
Detta gör ett test reproducerbart.

## 49. ForwardTestRun

Forward testing ska lagras separat från historiska backtests.

Fält:

- forward_test_id
- strategy_version_id
- environment
- account_id
- started_at
- ended_at
- status
- configuration
- results
Demo-forward-test ska inte blandas ihop med live-resultat.

## 50. Environment

Alla relevanta objekt ska känna till environment när det behövs.

Tillåtna kärnmiljöer:

- development
- backtest
- demo
- live
Data från dessa miljöer får inte blandas ihop i performance-statistik utan explicit val.

## 51. ExecutionRunner

ExecutionRunner representerar den externa Windows/VPS-processen.

Fält:

- runner_id
- name
- environment
- host_type
- runner_version
- status
- provider_status
- broker_status
- last_heartbeat
- last_reconciliation
- network_policy
- execution_enabled
## 52. Runner Health

Runner health ska kunna innehålla:

- online
- provider connected
- broker connected
- account synchronized
- clock healthy
- market data fresh
- disk healthy
- execution enabled
Om kritisk health saknas ska execution blockeras.

## 53. KillSwitchState

Kill switches ska vara explicit modellerade.

Fält:

- kill_switch_id
- scope_type
- scope_id
- active
- reason
- activated_by
- activated_at
- cleared_by
- cleared_at
Scope kan exempelvis vara:

- global
- account
- strategy
- instrument
- runner
## 54. SystemEvent

Tradingdomänen ska ha ett append-oriented event log.

Fält:

- event_id
- event_type
- entity_type
- entity_id
- timestamp
- source_component
- correlation_id
- payload_reference
- severity
Exempel:

```
SETUP_CREATED
RISK_DENIED
ORDER_FILLED
KILL_SWITCH_ACTIVATED
```

## 55. Correlation ID

En komplett tradinglivscykel ska kunna följas med correlation ID.

Exempel:

4H thesis

```
→ setup
→ signal
→ risk decision
→ proposal
→ execution
→ order
→ fill
→ trade
```

Alla relaterade events ska kunna kopplas ihop.

## 56. Auditability

För varje faktisk trade ska systemet kunna svara på:

- vilken strategy version användes?
- vilken data fanns då?
- vilken setup upptäcktes?
- vilka regler passerade?
- vilka regler misslyckades?
- vad sa AI?
- vad beslutade Risk Engine?
- vad beslutade Prop Firm Engine?
- vem eller vad godkände?
- vilket execution intent skickades?
- vad svarade providern?
- vilken fill erhölls?
- varför stängdes positionen?
- vad blev resultatet?
## 57. Immutability

Historiska beslut ska inte skrivas över.

Om ett beslut ändras ska systemet skapa:

- ny version
- nytt event
- eller nytt beslut
och behålla det ursprungliga.

Exempel:

Ett RiskDecision = DENY får inte senare redigeras till ALLOW.

Ett nytt RiskDecision ska skapas.

## 58. Soft Delete

Tradinghistorik ska som huvudprincip inte hard-deletas.

Om ett objekt behöver tas ur normal användning ska:

- archived
- deprecated
- inactive
- invalidated
användas där det är lämpligt.

Audit-data ska bevaras.

## 59. Datakvalitet

Market data ska kunna märkas med quality state.

Exempel:

- valid
- stale
- incomplete
- duplicate
- corrected
- suspect
Strategi- och riskbeslut ska kunna referera till data quality state.

## 60. Precision

Pris-, risk- och quantity-data får inte modelleras med godtycklig floating-point precision.

Implementation ska använda en kontrollerad decimal- eller instrumentanpassad precision för:

- prices
- tick values
- money
- risk
- quantity
Detta är särskilt viktigt för position sizing och audit.

## 61. Time Consistency

Canonical timestamps lagras i UTC.

Systemet ska samtidigt kunna lagra eller härleda:

- trading date
- local session time
- America/New_York session context
Det får inte finnas tvetydighet kring vilken tradingdag en trade tillhör.

## 62. NewsEvent

Ekonomiska nyheter bör representeras som eget objekt.

Fält:

- news_event_id
- provider
- currency
- impact
- event_type
- scheduled_at
- actual_at
- title
- status
Strategy Engine och Risk Engine ska kunna använda samma canonical NewsEvent.

## 63. News Policy Evaluation

Systemet ska kunna logga:

- relevant event
- blackout start
- blackout end
- existing position exit deadline
- evaluation result
För Omnira Liquidity Manipulation v1.0:

- no entry: T-1h till T+4h
- existing position exit: T-15m
## 64. Manual External Trade

En manuellt öppnad position hos providern ska kunna importeras utan att betraktas som strategy-generated.

Origin ska kunna vara:

- omnira
- manual
- imported
- unknown
unknown ska blockera ny trading tills reconciliation är klar.

## 65. AccountSnapshot

Systemet ska regelbundet kunna lagra account snapshots.

Fält:

- account_id
- timestamp
- balance
- equity
- realized_pnl
- unrealized_pnl
- daily_pnl
- drawdown
- margin
- free_margin
- open_positions
Risk Engine ska använda färsk account state.

## 66. Daily Risk State

För att undvika olika tolkningar av daily loss ska systemet kunna representera dagens riskläge explicit.

Fält:

- account_id
- trading_date
- starting_balance
- starting_equity
- realized_pnl
- unrealized_pnl
- current_equity
- daily_loss_used
- daily_loss_remaining
- reset_time
- calculation_method
Prop firms kan använda annan beräkningsmetod än intern risk.

Därför ska dessa hållas separata.

## 67. Exposure State

Risk Engine ska kunna beräkna och lagra:

- gross exposure
- net exposure
- instrument exposure
- asset-class exposure
- correlated exposure
Detta blir viktigare när systemet senare handlar fler instrument.

## 68. Reconciliation Record

Varje reconciliation mellan Omnira och providern ska kunna loggas.

Fält:

- reconciliation_id
- runner_id
- account_id
- started_at
- completed_at
- expected_state
- observed_state
- discrepancies
- resolution
- status
Ny execution blockeras om kritisk discrepancy kvarstår.

## 69. Data Ownership

Varje typ av data ska ha en tydlig source of truth.

Exempel:

Market price: Market Data Layer

Strategy state: Strategy Engine

Risk status: Risk Engine

Prop status: Prop Firm Engine

Approval: Approval Service

Broker order/fill: Provider/Broker

Visualization: UI, aldrig source of truth

## 70. Atlas Access

Atlas ska kunna läsa strukturerad tradingdata genom Trading Domain.

Atlas ska inte behöva tolka rå databasstruktur direkt.

Exempel på framtida queries:

Visa varför senaste setupen nekades.

Visa alla A+ setups senaste 30 dagarna.

Jämför London och New York expectancy.

Visa aktuell riskbudget.

Visa vad Strategy Engine väntar på just nu.

## 71. Atlas Market View Data Contract

Chart UI ska få strukturerade visualiseringsobjekt såsom:

- CandleSeries
- LiquidityZone
- FVGZone
- SwingPoint
- SMTMarker
- ManipulationMarker
- EntryMarker
- StopMarker
- TargetMarker
- BreakEvenMarker
- StrategyState
- TradeProposal
- RiskDecision
UI:t ska inte försöka återskapa strategin själv från candles.

## 72. Data Retention

Tradingbeslut, riskbeslut och executionhistorik ska bevaras långsiktigt.

Högupplöst market data kan senare få separat retention policy beroende på:

- kostnad
- mängd
- backtestbehov
Men data som krävs för att förstå och reproducera en trade får inte raderas utan explicit policy.

## 73. Minimum Viable Schema – Fas 1

Fas 1 behöver inte implementera varenda framtida tabell direkt.

Minimum för Trading Core ska dock minst omfatta:

- brokers
- trading_accounts
- instruments
- strategies
- strategy_versions
- strategy_configurations
- trading_sessions
- liquidity_levels
- fvg_zones
- strategy_setups
- strategy_signals
- risk_profiles
- risk_rules
- risk_decisions
- prop_firm_profiles
- prop_rules
- prop_decisions
- trade_proposals
- approvals
- orders
- positions
- trades
- journal_entries
- system_events
Execution-specifika delar kan förberedas men hållas inaktiva.

## 74. Schema Evolution

Databasändringar ska ske genom migrations.

Production-schema får inte ändras manuellt utan versionskontrollerad migration.

Migrationer ska kunna:

- granskas
- testas
- rollback-planeras
- kopplas till Git commit
## 75. No Silent Schema Drift

Claude, Atlas eller framtida agenter får inte skapa nya tradingfält eller tabeller i production enbart för att lösa ett lokalt problem utan att datamodellen uppdateras.

Materiella schemaändringar ska vara arkitekturförändringar.

## 76. Canonical Data Principle

Tradingdata ska beskriva verkligheten och beslutsprocessen separat.

Den centrala principen är:

Vi sparar inte bara vad traden gjorde. Vi sparar varför systemet gjorde det.

Detta är nödvändigt för:

- risk
- debugging
- forskning
- förbättring
- prop firm compliance
- framtida autonomi
## Dokumentstatus

Dokument: Omnira Trading System – Datamodell

Version: v0.1

Revision: 2026-08-27 – additivt fält break_even_trigger_type (SWING | WINDOW_CLOSE) efter
att London window-close break-even låstes. Inga befintliga fält ändrade eller borttagna.

Revision: 2026-08-28 – providerspecifika exempelvärden gjorda provider-neutrala efter
Beslut D (futures-native execution). MT5 var ett implementation-specifikt exempel, inte
en modellbindning. Fältet `MT5_status` heter nu `provider_status`. Inga entiteter,
relationer eller states omdesignade. Ingen modellversionshöjning krävs.

Status: Fas 0 – Första datamodell

Strategi: Canonical v1.0

Systemarkitektur: v0.1

Riskmodell: Nästa Fas 0-del

Prop firm-modell: Ej fullständigt specificerad

Implementation: Ej påbörjad

Schema migration: Ej skapad

Execution: Förbjuden

Datamodellen ska granskas tillsammans med Risk Engine- och Prop Firm-specifikationerna innan den uppgraderas till Canonical Data Model v1.0.
