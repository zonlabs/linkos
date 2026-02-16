-- Create a secure function to increment usage
-- This function runs with SECURITY DEFINER privileges (bypassing RLS)
-- ensuring that only this specific operation is allowed, regardless of the caller's role.

CREATE OR REPLACE FUNCTION increment_usage(user_id_param UUID, date_param DATE)
RETURNS VOID AS $$
DECLARE
    current_count INTEGER;
BEGIN
    -- Check if a record exists for this user and date
    SELECT request_count INTO current_count
    FROM user_daily_usage
    WHERE user_id = user_id_param AND date = date_param;

    IF current_count IS NULL THEN
        -- Insert new record
        INSERT INTO user_daily_usage (user_id, date, request_count, updated_at)
        VALUES (user_id_param, date_param, 1, NOW());
    ELSE
        -- Update existing record
        UPDATE user_daily_usage
        SET request_count = current_count + 1,
            updated_at = NOW()
        WHERE user_id = user_id_param AND date = date_param;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to anon and authenticated roles
-- This allows the Hub (using anon key) to call this function.
GRANT EXECUTE ON FUNCTION increment_usage(UUID, DATE) TO anon;
GRANT EXECUTE ON FUNCTION increment_usage(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_usage(UUID, DATE) TO service_role;
