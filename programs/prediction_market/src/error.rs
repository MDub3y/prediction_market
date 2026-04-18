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
}