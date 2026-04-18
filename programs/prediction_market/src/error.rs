use anchor_lang::prelude::*;

#[error_code]
pub enum PredictionMarketError {
  #[msg("Invalid settlement deadline")]
  InvalidSettlementDeadline,
  #[msg("Market already settled")]
  MarketSettled,
  #[msg("Market has expired")]
  MarketExpired,
  #[msg("Invalid amount")]
  InvalidAmount,
  #[msg("Math overflow")]
  MathOverflow,
  #[msg("Invalid winning outcome")]
  InvalidWinningOutcome,
  #[msg("Market is not settled yet")]
  MarketNotSettled,
  #[msg("Winning outcome is not set yet")]
  WinningOutcomeNotSet,
}