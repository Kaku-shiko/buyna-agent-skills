const errors = {
  CUSTOMER_SESSION_REQUIRED:[401,'session_required',false],
  ORDER_NOT_FOUND:[404,'order_not_found',false],
  INVENTORY_INSUFFICIENT:[409,'insufficient_stock',false],
  ORDER_IDEMPOTENCY_CONFLICT:[409,'order_changed',false],
  ORDER_NOT_PAYABLE:[409,'order_not_payable',false],
  payment_status_unavailable:[503,'payment_status_unavailable',true],
  payment_configuration_missing:[503,'payment_configuration_missing',false],
  payment_connection_check_required:[503,'payment_connection_check_required',false],
  payment_explicitly_disabled:[503,'payment_explicitly_disabled',false],
};

export function backendErrorResponse(error) {
  const [status,code,retryable]=errors[error?.code??error?.message]??[500,'operation_failed',false];
  // Never expose provider errors, SQL, credentials or customer data to clients.
  return {status,body:{ok:false,error:{code,retryable}}};
}
